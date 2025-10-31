import { Context, Hono } from "hono";
import { R2Bucket, D1Database } from "@cloudflare/workers-types";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import {
    tweets,
    replicacheClients,
    userToTweet,
    users,
} from "@comifuro/core/schema";
import { z } from "zod";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { tweetsOperations } from "@comifuro/core";
import { ReplicacheClientSelect, TweetInsert, TweetSelect } from "@comifuro/core/types";
import { cors } from "hono/cors";
import { pullTweets } from "./pull-tweets";
import { marksPull } from "./pull";
import { marksPush } from "./push";

type Bindings = {
    R2: R2Bucket;
    DB: D1Database;
    PASSWORD: string;
    CF_TOKEN: string;
    CF_ZONE: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const currentSchemaVersion = 3;

export function getDb(c: Context) {
    return drizzle(c.env.DB);
}

app.use(
    "*",
    cors({
        origin: (origin) => {
            const allowed = [
                "http://localhost:5173",
                "http://localhost:3000",
                "https://cf.peculiarnewbie.com",
            ];
            if (!origin) return "";
            return allowed.includes(origin) ? origin : "";
        },
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: [
            "Content-Type",
            "Authorization",
            "X-Replicache-RequestID",
        ],
        exposeHeaders: ["Content-Length"],
        maxAge: 86400,
        credentials: true,
    }),
);

app.get("/", (c) => c.text("Hello Hono!"))
    .post("/upload/:key", async (c) => {
        const password = c.req.header("pec-password");
        if (password !== c.env.PASSWORD)
            return c.json({ error: "unauthed" }, 403);
        const key = c.req.param("key");
        let decodedKey: string;
        try {
            decodedKey = decodeURIComponent(key);
        } catch (error) {
            return c.json({ error: "Invalid key encoding" }, 400);
        }
        const data = await c.req.formData();
        const file = data.get("image");
        if (!file || typeof file === "string") {
            return c.text("No image file provided", 400);
        }

        const r2 = c.env.R2;
        await r2.put(decodedKey, file as any);

        c.header("Content-Type", "image/webp");
        return c.json({ ok: true });
    })
    .post("/tweets/upsert", async (c) => {
        const password = c.req.header("pec-password");
        if (password !== c.env.PASSWORD)
            return c.json({ error: "unauthed" }, 403);
        const body = await c.req.json();
        const parsed = z
            .array(
                z.object({
                    id: z.string().min(1),
                    user: z.string().min(1),
                    timestamp: z.union([z.number(), z.string()]),
                    text: z.string(),
                    imageMask: z.number().int().nonnegative(),
                }),
            )
            .safeParse(body);
        const db = getDb(c);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0].message }, 400);
        }
        const rows = parsed.data.map((t) => ({
            ...t,
            timestamp: new Date(t.timestamp),
        })) as TweetInsert[];
        // Insert in small chunks to keep parameter counts low
        let total = 0;
        for (let i = 0; i < rows.length; i += 20) {
            const chunk = rows.slice(i, i + 20);
            const rest = await tweetsOperations.upsertMultipleTweets(db, chunk);
        }
        return c.json({ ok: true, count: total });
    })
    .post("/replicache/tweets/pull", async (c) => {
        return await pullTweets(c, currentSchemaVersion);
    })
    .post("/replicache/pull", async (c) => {
        const auth = c.req.header("Authorization");
        console.log("auth", auth);

        return await marksPull(c, currentSchemaVersion);
    })
    .post("/replicache/push", async (c) => {
        return await marksPush(c, currentSchemaVersion);
    });

export default app;
