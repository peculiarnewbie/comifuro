import { withSpan } from "./telemetry";
import { setTimeout as sleep } from "node:timers/promises";

export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly retryAfterMs: number,
        operation?: string,
    ) {
        super(`HTTP ${status}${operation ? ` (${operation})` : ""}`);
    }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number {
    if (!value) return 0;
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export class Runtime {
    private notBefore = 0;
    constructor(
        readonly signal: AbortSignal,
        public onCooldown: (until: number, reason: string) => void = () => {},
    ) {}

    async wait(ms: number) {
        const until = Date.now() + ms;
        this.signal.throwIfAborted();
        while (Date.now() < until) {
            await sleep(Math.min(30_000, until - Date.now()), undefined, { signal: this.signal });
        }
    }

    async cooldown(ms: number, reason: string) {
        this.notBefore = Math.max(this.notBefore, Date.now() + ms);
        this.onCooldown(this.notBefore, reason);
        await this.wait(ms);
    }

    async request<T>(
        url: string | URL | Request,
        init: RequestInit,
        read: (response: Response) => Promise<T>,
        timeoutMs = 60_000,
    ): Promise<T> {
        for (let attempt = 0; ; attempt += 1) {
            this.signal.throwIfAborted();
            if (this.notBefore > Date.now()) await this.wait(this.notBefore - Date.now());
            const signal = AbortSignal.any([
                this.signal,
                AbortSignal.timeout(timeoutMs),
                ...(init.signal ? [init.signal] : []),
                ...(url instanceof Request ? [url.signal] : []),
            ]);
            try {
                return await withSpan(
                    "scraper.http",
                    {
                        "http.request.method":
                            init.method ?? (url instanceof Request ? url.method : "GET"),
                        "server.address": new URL(url instanceof Request ? url.url : url.toString())
                            .hostname,
                        "retry.attempt": attempt,
                    },
                    async () => {
                        const response = await fetch(url instanceof Request ? url.clone() : url, {
                            ...init,
                            signal,
                        });
                        if (!response.ok) {
                            const retryAfterMs = parseRetryAfter(
                                response.headers.get("retry-after"),
                            );
                            await response.body?.cancel();
                            throw new HttpError(
                                response.status,
                                retryAfterMs,
                                new URL(response.url).pathname,
                            );
                        }
                        // Consume the body within the deadline; headers alone do not complete a request.
                        return await read(response);
                    },
                );
            } catch (error) {
                this.signal.throwIfAborted();
                init.signal?.throwIfAborted();
                if (url instanceof Request) url.signal.throwIfAborted();
                const retryable =
                    error instanceof HttpError
                        ? [408, 429, 500, 502, 503, 504].includes(error.status)
                        : error instanceof TypeError ||
                          (error instanceof Error &&
                              ["TimeoutError", "AbortError"].includes(error.name));
                if (!retryable) throw error;
                const delay = Math.max(
                    30_000 * 2 ** attempt + Math.floor(Math.random() * 5_000),
                    error instanceof HttpError ? error.retryAfterMs : 0,
                    error instanceof HttpError && error.status === 429 ? 15 * 60_000 : 0,
                );
                // Persist even the final cooldown so a restart cannot immediately hit the service again.
                this.notBefore = Math.max(this.notBefore, Date.now() + delay);
                this.onCooldown(
                    this.notBefore,
                    error instanceof Error ? error.message : "request failed",
                );
                if (attempt >= 2) throw error;
                await this.wait(delay);
            }
        }
    }
}

export const defaultRuntime = new Runtime(new AbortController().signal);
