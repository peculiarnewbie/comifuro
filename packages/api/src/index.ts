import { drizzle } from "drizzle-orm/d1";
import { Context, Hono } from "hono";
import { cache } from "hono/cache";
import * as schema from "@comifuro/core/schema";
import { desc } from "drizzle-orm";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

function getDb(c: Context) {
    return drizzle(c.env.DB, { schema: schema });
}

app.get("/", (c) => c.body("hello hono")).get(
    "/tweets/full",
    cache({
        cacheName: (c) => `tweets-full`,
        wait: true,
        cacheControl: "max-age=86400",
    }),
    async (c) => {
        c.header("Cache-Tag", `tweets-full`);

        const db = getDb(c);
        const rows = await db
            .select()
            .from(schema.tweets)
            .orderBy(desc(schema.tweets.timestamp));

        return c.json(rows);
    }
);

export default {
    fetch: app.fetch,
};
