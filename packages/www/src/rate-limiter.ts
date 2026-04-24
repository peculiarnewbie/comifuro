import { DurableObject } from "cloudflare:workers";

export interface RateLimiterEnv {
    RATE_LIMITER?: DurableObjectNamespace<RateLimiter>;
}

export class RateLimiter extends DurableObject<RateLimiterEnv> {
    constructor(ctx: DurableObjectState, env: RateLimiterEnv) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS rate_limits (
                    key TEXT PRIMARY KEY NOT NULL,
                    count INTEGER NOT NULL,
                    reset_at INTEGER NOT NULL
                )
            `);
        });
    }

    check(
        ip: string,
        endpoint: string,
        maxRequests: number,
        windowMs: number,
    ): boolean {
        const key = `${ip}:${endpoint}`;
        const now = Date.now();

        const [result] = this.ctx.storage.sql.exec<{
            count: number;
            reset_at: number;
        }>(
            `SELECT count, reset_at FROM rate_limits WHERE key = ?`,
            key,
        ).toArray();

        if (!result || now > result.reset_at) {
            this.ctx.storage.sql.exec(
                `INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)`,
                key,
                now + windowMs,
            );
            return true;
        }

        if (result.count >= maxRequests) {
            return false;
        }

        this.ctx.storage.sql.exec(
            `UPDATE rate_limits SET count = count + 1 WHERE key = ?`,
            key,
        );
        return true;
    }
}

export async function isRateLimited(
    env: RateLimiterEnv,
    ip: string,
    endpoint: string,
    maxRequests = 60,
    windowMs = 60000,
): Promise<boolean> {
    if (!env.RATE_LIMITER) {
        console.warn("RATE_LIMITER binding is missing; skipping rate limit check");
        return false;
    }

    try {
        const stub = env.RATE_LIMITER.getByName("global");
        return !(await stub.check(ip, endpoint, maxRequests, windowMs));
    } catch (error) {
        console.error("rate limiter check failed; allowing request", error);
        return false;
    }
}
