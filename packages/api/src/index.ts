import { Context, Hono } from "hono";
import { R2Bucket, D1Database } from "@cloudflare/workers-types";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import {
    tweets,
    replicacheClientGroups,
    replicacheClients,
} from "@comifuro/core/schema";
import { z } from "zod";
import { desc, eq, gt, lt } from "drizzle-orm";
import { tweetsOperations, tweetsTypes } from "@comifuro/core";
import { ReplicacheClientSelect, TweetSelect } from "@comifuro/core/types";
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
    .post("/replicache/pull", async (c) => {
        const limit = Number(c.req.query("limit") ?? 500);

        const body = await c.req.json();

        console.log({ body: JSON.stringify(body) });

        const { cookie, clientGroupID } = body;

        console.log("cookie", cookie);

        type PullCookie = {
            newestTweetTimestamp?: number;
            oldestTweetTimestamp?: number;
            version?: number;
            donePullingTweet?: boolean;
        };

        // change to pull from newest first, but caching both the newest tweets and oldest pulled tweets
        let parsedCookie = {} as PullCookie;

        if (cookie) {
            parsedCookie = JSON.parse(cookie) as PullCookie;
        }

        let newestTweetTimestamp = parsedCookie?.newestTweetTimestamp;
        let oldestTweetTimestamp = parsedCookie?.oldestTweetTimestamp;
        let version = parsedCookie?.version;
        let donePullingTweet = parsedCookie?.donePullingTweet;

        const preOps = [];

        const db = getDb(c);
        let clientGroup = await getClientGroup(clientGroupID, db);

        //TODO: check if user owns client group

        let tweetsRows = [] as TweetSelect[];
        if (!newestTweetTimestamp) {
            console.log("new init");
            tweetsRows = await db
                .select()
                .from(tweets)
                .orderBy(desc(tweets.timestamp))
                .limit(limit);

            const firstTweet = tweetsRows[0];
            const lastTweet = tweetsRows[tweetsRows.length - 1];
            if (firstTweet) {
                newestTweetTimestamp = firstTweet.timestamp.getTime();
                oldestTweetTimestamp = lastTweet.timestamp.getTime();
                donePullingTweet = false;
                console.log("clearing");
                preOps.push({
                    op: "clear",
                });
            }
        } else {
            const newestTweet = (
                await db
                    .select()
                    .from(tweets)
                    .orderBy(desc(tweets.timestamp))
                    .limit(1)
            )[0];

            if (newestTweet.timestamp.getTime() > newestTweetTimestamp) {
                console.log("there are newer tweets");
                tweetsRows = (
                    await db
                        .select()
                        .from(tweets)
                        .where(
                            gt(tweets.timestamp, new Date(newestTweetTimestamp))
                        )
                        .orderBy(tweets.timestamp)
                        .limit(limit)
                ).toReversed();
                const firstTweet = tweetsRows[0];
                if (firstTweet) {
                    newestTweetTimestamp = firstTweet.timestamp.getTime();
                    donePullingTweet = false;
                }
            } else {
                console.log("there are older tweets");
                if (!oldestTweetTimestamp) {
                    oldestTweetTimestamp = Date.now();
                }
                tweetsRows = await db
                    .select()
                    .from(tweets)
                    .orderBy(desc(tweets.timestamp))
                    .where(lt(tweets.timestamp, new Date(oldestTweetTimestamp)))
                    .limit(limit);
                if (tweetsRows.length === 0) {
                    donePullingTweet = true;
                    console.log("done pulling");
                } else {
                    const lastTweet = tweetsRows[tweetsRows.length - 1];
                    console.log(
                        "pulling more",
                        tweetsRows.length,
                        lastTweet.timestamp.getTime()
                    );
                    oldestTweetTimestamp = lastTweet.timestamp.getTime();
                    donePullingTweet = false;
                    console.log("Updated oldestTweetTimestamp to:", oldestTweetTimestamp);
                }
            }
        }

        const ops = tweetsRows.map((t) => {
            const { id, ...rest } = t;
            return {
                op: "put",
                key: id,
                value: rest,
            };
        });

        console.log("Response cookie values:", {
            newestTweetTimestamp,
            oldestTweetTimestamp,
            donePullingTweet,
            version: version ?? 1,
        });
        const res = {
            lastMutationIDChanges: {},
            cookie: JSON.stringify({
                newestTweetTimestamp,
                oldestTweetTimestamp,
                donePullingTweet,
                version: version ?? 1,
            } satisfies PullCookie),
            patch: [...preOps, ...ops],
        };
        console.log({
            first: tweetsRows[0].timestamp.getTime(),
            last: tweetsRows[tweetsRows.length - 1].timestamp.getTime(),
        });
        console.log({ rows: tweetsRows });
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
