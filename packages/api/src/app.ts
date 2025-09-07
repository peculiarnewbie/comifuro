import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { Context, Elysia, t } from "elysia";
// import { env } from "cloudflare:workers";
import * as schema from "@comifuro/core/schema";
import { desc } from "drizzle-orm";
import { tweetsOperations, tweetsTypes } from "@comifuro/core";

const env = process.env;

function getDb() {
    //@ts-expect-error
    return drizzle(env.DB, { schema: schema });
}

const app = new Elysia({ aot: false })
    .get("/", (ctx) => "Hello Elysia")
    .post(
        "/upload/:key",
        async ({ params, headers, body, status, set }) => {
            const password = headers["pec-password"];
            if (password !== env.PASSWORD)
                return status(403, { error: "unauthed" });
            const key = params.key;
            let decodedKey: string;
            try {
                decodedKey = decodeURIComponent(key);
            } catch (error) {
                return status(400, { error: "Invalid key encoding" });
            }
            const file = body.image;
            if (!file || typeof file === "string") {
                return status(400, { error: "No image file provided" });
            }

            //@ts-expect-error
            const r2 = env.R2 as R2Bucket;
            await r2.put(decodedKey, file);

            set.headers = { "Content-Type": "image/webp" };
            status(200, { ok: true });
        },
        {
            headers: t.Object({ "pec-password": t.String() }),
            params: t.Object({ key: t.String() }),
            body: t.Object({
                image: t.File(),
            }),
        }
    )
    .get("/tweets/last", async (c) => {
        const db = getDb();
        const rows = await db
            .select()
            .from(schema.tweets)
            .orderBy(desc(schema.tweets.timestamp))
            .limit(1);
        return rows[0];
    })
    .get("/tweets/last", async (c) => {
        const db = getDb();
        const rows = await db
            .select()
            .from(schema.tweets)
            .orderBy(desc(schema.tweets.timestamp))
            .limit(1);
        return rows[0];
    })
    .get(
        "/tweets",
        async ({ query }) => {
            const offset = query.offset ?? 0;
            const limit = query.limit ?? 100;
            const db = getDb();
            const rows = await db
                .select()
                .from(schema.tweets)
                .limit(limit)
                .offset(offset);
            return rows;
        },
        {
            query: t.Object({
                offset: t.Optional(t.Number()),
                limit: t.Optional(t.Number()),
            }),
        }
    )
    .post(
        "/tweets/upsert",
        async ({ headers, body, status }) => {
            const password = headers["pec-password"];
            if (password !== env.PASSWORD)
                return status(403, { error: "unauthed" });

            const db = getDb();

            const rows = body.map((t) => ({
                ...t,
                timestamp: new Date(t.timestamp),
            })) as tweetsTypes.TweetInsert[];
            // Insert in small chunks to keep parameter counts low
            let total = 0;
            for (let i = 0; i < rows.length; i += 20) {
                const chunk = rows.slice(i, i + 20);
                const rest = await tweetsOperations.upsertMultipleTweets(
                    db,
                    chunk
                );
            }
            return { ok: true, count: total };
        },
        {
            headers: t.Object({ "pec-password": t.String() }),
            params: t.Object({ key: t.String() }),
            body: t.Array(
                t.Object({
                    id: t.String({ minLength: 1 }),
                    user: t.String({ minLength: 1 }),
                    timestamp: t.Union([t.Number(), t.String()]),
                    text: t.String(),
                    imageMask: t.Number(),
                })
            ),
        }
    )
    .get("/purge-metadata", async (c) => {
        const zone = env.CF_ZONE;
        const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.CF_TOKEN}`,
            },
            body: JSON.stringify({
                files: [
                    "https://r2.comifuro.peculiarnewbie.com/tweets.json.gz",
                ],
            }),
        });
        return res as any;
    })
    .get("/purge-everything", async (c) => {
        const zone = env.CF_ZONE;
        const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.CF_TOKEN}`,
            },
            body: JSON.stringify({ purge_everything: true }),
        });
        return res as any;
    });

export default app;
