import type { Context } from "hono";
import type { RateLimiterEnv } from "../rate-limiter";
import { UserId } from "@comifuro/core/schema";

export type WorkerBindings = RateLimiterEnv & {
    ASSETS: Fetcher;
    DB: D1Database;
    R2: R2Bucket;
    PASSWORD: string;
};

export type Env = {
    Bindings: WorkerBindings;
    Variables: {
        userId: UserId | null;
        isAdmin: boolean;
        requestId: string;
    };
};

export type AppContext = Context<Env>;
