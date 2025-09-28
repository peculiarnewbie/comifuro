import Elysia from "elysia";
import { drizzle } from "drizzle-orm/d1";
import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { tweets } from "@comifuro/core/schema";

const getDb = (db: D1Database) => {
    return drizzle(db);
};

export const createRoutes = (app: Elysia, d1: D1Database, bucket: R2Bucket) => {
    const res = app
        .get("/api", () => "Hello Cloudflare Worker!")
        .get("/api/tweets", async ({ request }) => {
            const url = new URL(request.url);
            const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
            const limit = Math.min(
                200,
                Number(url.searchParams.get("limit") ?? 100) || 100
            );
            const db = getDb(d1);
            const rows = await db
                .select()
                .from(tweets)
                .limit(limit)
                .offset(offset);
            return rows;
        })
        .compile();

    return res;
};
