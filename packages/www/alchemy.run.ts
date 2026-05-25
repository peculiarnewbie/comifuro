import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const COMIFURO_DOMAIN = process.env.COMIFURO_DOMAIN;

/**
 * Comifuro infrastructure stack.
 *
 * Deploys the Comifuro web application as a Cloudflare Worker with static
 * assets, D1 database, R2 bucket, and Durable Objects.
 */
export const ComifuroStack = Alchemy.Stack(
    "Comifuro",
    {
        providers: Cloudflare.providers(),
        state: Cloudflare.state(),
    },
    Effect.gen(function* () {
        const stage = yield* Alchemy.Stage;

        const db = yield* Cloudflare.D1Database("DB", {
            name: physicalName(stage, "db"),
            migrationsDir: "../packages/core/migrations",
        });

        const bucket = yield* Cloudflare.R2Bucket("R2", {
            name: physicalName(stage, "media"),
        });

        // Durable Object declared as a binding reference.
        // The actual class (RateLimiter) is exported from src/worker.ts
        // and Alchemy bundles it as part of the Worker deploy.
        const rateLimiter = Cloudflare.DurableObjectNamespace("RATE_LIMITER", {
            className: "RateLimiter",
        });

        const worker = yield* Cloudflare.Worker("ComifuroWorker", {
            name: physicalName(stage, "www"),
            main: "packages/www/src/worker.ts",
            assets: "packages/www/dist",
            compatibility: {
                date: "2026-05-26",
                flags: ["nodejs_compat"],
            },
            bindings: {
                DB: db,
                R2: bucket,
                RATE_LIMITER: rateLimiter,
            },
            env: {
                APP_PUBLIC_URL: COMIFURO_DOMAIN
                    ? `https://${COMIFURO_DOMAIN}`
                    : "http://localhost:3000",
            },
            domain: COMIFURO_DOMAIN,
            observability: {
                enabled: true,
                headSamplingRate: 1,
            },
        });

        return {
            url: worker.url ?? (COMIFURO_DOMAIN ? `https://${COMIFURO_DOMAIN}` : undefined),
            workerName: worker.workerName,
            dbId: db.databaseId,
            bucketName: bucket.bucketName,
        };
    }),
);

export default ComifuroStack;

function physicalName(stage: string | undefined, ...parts: string[]): string {
    const safeStage = (stage || "dev").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
    return ["comifuro", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}
