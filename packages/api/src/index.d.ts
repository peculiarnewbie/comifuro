import { Context, Hono } from "hono";
import { DrizzleD1Database } from "drizzle-orm/d1";
type Bindings = {
    DB: D1Database;
    R2: R2Bucket;
    PASSWORD: string;
};
declare const app: Hono<{
    Bindings: Bindings;
}, import("hono/types").BlankSchema, "/">;
export declare function getDb(c: Context<{
    Bindings: Bindings;
}>): DrizzleD1Database;
export default app;
