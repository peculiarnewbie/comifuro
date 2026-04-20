import type { Context } from "hono";
import type { RateLimiterEnv } from "../rate-limiter";

export type WorkerBindings = RateLimiterEnv & {
    ASSETS: Fetcher;
    DB: D1Database;
    R2: R2Bucket;
    PASSWORD: string;
};

export type Env = {
    Bindings: WorkerBindings;
    Variables: {
        userId: string | null;
        isAdmin: boolean;
    };
};

export type AppContext = Context<Env>;
