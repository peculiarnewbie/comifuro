import { tweets } from "@comifuro/core/schema";
import { env } from "cloudflare:workers";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";

const getDb = () => {
    return drizzle(env.DB);
};

export const createHonoApp = () => {
    const app = new Hono();

    app.get("/api/", (c) => c.text("Hello Hono!"))
        .get("/api/tweets/last", async (c) => {
            const db = getDb();
            const rows = await db
                .select()
                .from(tweets)
                .orderBy(desc(tweets.timestamp))
                .limit(1);
            return c.json(rows[0] ?? null);
        })
        .get("/api/tweets", async (c) => {
            const url = new URL(c.req.url);
            const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
            const limit = Math.min(
                200,
                Number(url.searchParams.get("limit") ?? 100) || 100
            );
            const db = getDb();
            const rows = await db
                .select()
                .from(tweets)
                .limit(limit)
                .offset(offset);
            return c.json(rows);
        });

    return app;
};
