import { Context, Hono } from "hono";
import { R2Bucket, D1Database } from "@cloudflare/workers-types";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import {
    tweets,
    replicacheClientGroups,
    replicacheClients,
} from "@comifuro/core/schema";
import { z } from "zod";
import { desc, eq, gt, sql } from "drizzle-orm";
import { tweetsOperations, tweetsTypes } from "@comifuro/core";
import {
    ReplicacheClientGroupSelect,
    ReplicacheClientSelect,
    TweetSelect,
} from "@comifuro/core/types";
import { DateTime } from "luxon";
import { cors } from "hono/cors";

type Bindings = {
    R2: R2Bucket;
    DB: D1Database;
    PASSWORD: string;
    CF_TOKEN: string;
    CF_ZONE: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function getDb(c: Context) {
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
    })
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
        //@ts-expect-error
        await r2.put(decodedKey, file);

        c.header("Content-Type", "image/webp");
        return c.json({ ok: true });
    })
    .get("/tweets/last", async (c) => {
        const db = getDb(c);
        const rows = await db
            .select()
            .from(tweets)
            .orderBy(desc(tweets.timestamp))
            .limit(1);
        return c.json(rows[0] ?? null);
    })
    .get("/tweets", async (c) => {
        const url = new URL(c.req.url);
        const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
        const limit = Math.min(
            200,
            Number(url.searchParams.get("limit") ?? 100) || 100
        );
        const db = getDb(c);
        const rows = await db.select().from(tweets).limit(limit).offset(offset);
        return c.json(rows);
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
                })
            )
            .safeParse(body);
        const db = getDb(c);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0].message }, 400);
        }
        const rows = parsed.data.map((t) => ({
            ...t,
            timestamp: new Date(t.timestamp),
        })) as tweetsTypes.TweetInsert[];
        // Insert in small chunks to keep parameter counts low
        let total = 0;
        for (let i = 0; i < rows.length; i += 20) {
            const chunk = rows.slice(i, i + 20);
            const rest = await tweetsOperations.upsertMultipleTweets(db, chunk);
        }
        return c.json({ ok: true, count: total });
    })
    .get("/purge-metadata", async (c) => {
        const zone = c.env.CF_ZONE;
        const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${c.env.CF_TOKEN}`,
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
        const zone = c.env.CF_ZONE;
        const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${c.env.CF_TOKEN}`,
            },
            body: JSON.stringify({ purge_everything: true }),
        });
        return res as any;
    })
    // .get("/replicache/pull", async (c) => {
    //     const temp = await import("./replicache-temp.json", {
    //         with: { type: "json" },
    //     });
    //     console.log(temp);
    //     const ops = temp.default.map((t) => {
    //         const { id, ...rest } = t;
    //         return {
    //             op: "put",
    //             key: id,
    //             value: rest,
    //         };
    //     });
    //     const res = {
    //         lastMutationIDChanges: {},
    //         cookie: 42,
    //         patch: [{ op: "clear" }, ...ops],
    //     };
    //     return c.json(res);
    // })
    .post("/replicache/pull", async (c) => {
        const limit = Number(c.req.query("limit") ?? 100);

        const body = await c.req.json();

        console.log({ body: JSON.stringify(body) });

        const { cookie, clientGroupID } = body;

        const parsedCookie = JSON.parse(cookie) as {
            lastTweetTimestamp?: number;
            version?: number;
        };

        const lastTweetTimestamp: number | undefined =
            parsedCookie?.lastTweetTimestamp;
        const version: number | undefined = parsedCookie?.version;

        console.log({ cookie: JSON.stringify(cookie), lastTweetTimestamp });

        const db = getDb(c);
        let clientGroup = await getClientGroup(clientGroupID, db);

        //TODO: check if user owns client group

        const rows = await db
            .select()
            .from(tweets)
            .orderBy(tweets.timestamp)
            .where(gt(tweets.timestamp, new Date(lastTweetTimestamp ?? 0)))
            .limit(limit);
        const ops = rows.map((t) => {
            const { id, ...rest } = t;
            return {
                op: "put",
                key: id,
                value: rest,
            };
        });

        const preOps = [];
        if (!lastTweetTimestamp) {
            console.log("clearing");
            preOps.push({
                op: "clear",
            });
        }
        const res = {
            lastMutationIDChanges: {},
            cookie: JSON.stringify({
                lastTweetTimestamp: rows[rows.length - 1].timestamp.getTime(),
                version,
            }),
            patch: [...preOps, ...ops],
        };
        console.log({
            first: rows[0].timestamp.getTime(),
            last: rows[rows.length - 1].timestamp.getTime(),
        });
        console.log({ rows });
        return c.json(res);
    })
    .post("/replicache/push", async (c) => {
        let errorMode = false;
        type ReplicachePushBody = {
            profileID: string;
            clientGroupID: string;
            mutations: {
                id: number;
                name: string;
                args: any;
                timestamp: number;
                clientID: string;
            }[];
            pushVersion: number;
            schemaVersion: string;
        };
        const body: ReplicachePushBody = await c.req.json();
        console.log(JSON.stringify(body));
        console.log("profile id:", body.profileID);
        console.log("client group id:", body.clientGroupID);
        console.log(
            "last mutation:",
            JSON.stringify(body.mutations[body.mutations.length - 1])
        );

        const db = getDb(c);
        let clientGroup = await getClientGroup(body.clientGroupID, db);

        for (const mutation of body.mutations) {
            let nextMutationID = 0;

            let client: ReplicacheClientSelect | null = null;
            const clientRes = await db
                .select()
                .from(replicacheClients)
                .where(eq(replicacheClients.id, mutation.clientID))
                .limit(1);

            if (clientRes.length === 0) {
                client = {
                    id: mutation.clientID,
                    clientGroupId: body.clientGroupID,
                    lastMutationId: 0,
                    lastModifiedVersion: 0,
                };
            } else {
                client = clientRes[0];
            }
        }

        // TODO: check if user owns client group
        // if it isn't found, register client group to user, link to user if they're logged in

        // TODO: verify clientGroupID owns mutation.clientId

        return c.json(body);
    });

const getClientGroup = async (clientGroupID: string, db: DrizzleD1Database) => {
    const clientGroupRes = await db
        .select()
        .from(replicacheClientGroups)
        .where(eq(replicacheClientGroups.id, clientGroupID))
        .limit(1);

    if (clientGroupRes.length === 0) {
        return {
            id: clientGroupID,
            userId: null,
        };
    } else {
        return clientGroupRes[0];
    }
};

export default app;
