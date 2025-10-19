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
    .get("/tweets/last", async (c) => {
        const db = getDb(c);
        const rows = await db
            .select()
            .from(tweets)
            .orderBy(desc(tweets.id))
            .limit(1);
        return c.json(rows[0] ?? null);
    })
    .get("/tweets", async (c) => {
        const url = new URL(c.req.url);
        const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
        const limit = Math.min(
            200,
            Number(url.searchParams.get("limit") ?? 100) || 100,
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
    .post("/replicache/tweets/pull", async (c) => {
        const limit = Number(c.req.query("limit") ?? 500);

        const body = await c.req.json();

        console.log(body);

        type PullCookie = {
            newestTweet?: string;
            oldestTweet?: string;
            order?: number;
            donePullingTweet?: boolean;
            schemaVersion?: number;
        };

        const { cookie, clientGroupID } = body as {
            cookie: PullCookie;
            clientGroupID: string;
        };

        console.log(cookie);

        // change to pull from newest first, but caching both the newest tweets and oldest pulled tweets

        let newestTweet = cookie?.newestTweet;
        let oldestTweet = cookie?.oldestTweet;
        let order = cookie?.order;
        let donePullingTweet = cookie?.donePullingTweet;
        let schemaVersion = cookie?.schemaVersion;

        const preOps = [];

        // TODO: create a migration function
        if (!schemaVersion || schemaVersion < currentSchemaVersion) {
            console.log("different schema. clearing");
            preOps.push({
                op: "clear",
            });
            newestTweet = "0";
        }

        const db = getDb(c);

        //TODO: check if user owns client group
        //TODO: handle deletion

        let tweetsRows = [] as TweetSelect[];
        if (!newestTweet) {
            console.log("new init");
            tweetsRows = await db
                .select()
                .from(tweets)
                .orderBy(desc(tweets.id))
                .limit(limit);

            const firstTweet = tweetsRows[0];
            const lastTweet = tweetsRows[tweetsRows.length - 1];
            if (firstTweet) {
                newestTweet = firstTweet.id;
                oldestTweet = lastTweet.id;
                donePullingTweet = false;
                console.log("clearing");
                preOps.push({
                    op: "clear",
                });
            }
        } else {
            const newest = (
                await db.select().from(tweets).orderBy(desc(tweets.id)).limit(1)
            )[0];

            if (newestTweet < newest.id) {
                console.log("there are newer tweets");
                tweetsRows = (
                    await db
                        .select()
                        .from(tweets)
                        .orderBy(tweets.id)
                        .where(gt(tweets.id, newestTweet))
                        .limit(limit)
                ).toReversed();
                const firstTweet = tweetsRows[0];
                if (firstTweet) {
                    newestTweet = firstTweet.id;
                    donePullingTweet = false;
                }
                const lastTweet = tweetsRows[tweetsRows.length - 1];
                if (!oldestTweet) oldestTweet = lastTweet.id;
            } else {
                console.log("there no newer tweets");
                if (!oldestTweet) {
                    oldestTweet = newest.id;
                }
                tweetsRows = await db
                    .select()
                    .from(tweets)
                    .orderBy(desc(tweets.id))
                    .where(lt(tweets.id, oldestTweet))
                    .limit(limit);
                if (tweetsRows.length === 0) {
                    donePullingTweet = true;
                    console.log("done pulling");
                } else {
                    console.log("there are older tweets");
                    const lastTweet = tweetsRows[tweetsRows.length - 1];
                    console.log(
                        "pulling more",
                        tweetsRows.length,
                        lastTweet.timestamp.getTime(),
                    );
                    oldestTweet = lastTweet.id;
                    donePullingTweet = false;
                    console.log(
                        "Updated oldestTweetTimestamp to:",
                        oldestTweet,
                    );
                }
            }
        }

        tweetsRows = tweetsRows.filter((x) => x.imageMask > 0);

        const ops =
            tweetsRows.length > 0
                ? tweetsRows.map((t) => {
                      const { id, ...rest } = t;
                      return {
                          op: "put",
                          key: id,
                          value: rest,
                      };
                  })
                : [];

        let newOrder: number | undefined;
        if (!order) {
            newOrder = 1;
        } else if (!donePullingTweet) {
            newOrder = order + 1;
        }

        const newCookie = {
            newestTweet,
            oldestTweet,
            donePullingTweet,
            order: newOrder ?? order,
            schemaVersion: currentSchemaVersion,
        } satisfies PullCookie;
        console.log({ message: "new cookie", ...newCookie });

        const res = {
            lastMutationIDChanges: {},
            cookie: newCookie,
            patch: [...preOps, ...ops],
        };
        return c.json(res);
    })
    .post("/replicache/pull", async (c) => {
        const body = await c.req.json();

        console.log(JSON.stringify(body));

        const { cookie, clientGroupID } = body as {
            cookie?: number;
            clientGroupID?: string;
        };

        let prevVersion = cookie ?? 0;
        let userId = clientGroupID;

        if (!userId)
            return c.json({ error: "userId is required for pull" }, 500);

        const db = getDb(c);
        const userRes = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));

        if (userRes.length < 1) return c.json({ error: "user not found" }, 500);

        const tweetsRes = await db
            .select()
            .from(userToTweet)
            .where(
                and(
                    eq(userToTweet.userId, userId),
                    gt(userToTweet.lastModifiedVersion, prevVersion),
                ),
            );

        const lastMutationIdRes = await db
            .select()
            .from(replicacheClients)
            .where(
                and(
                    eq(replicacheClients.userId, userId),
                    gt(replicacheClients.lastModifiedVersion, prevVersion),
                ),
            );

        const ops =
            tweetsRes.length > 0
                ? tweetsRes.map((t) => {
                      const { tweetId, ...rest } = t;
                      return {
                          op: "put",
                          key: tweetId,
                          value: rest,
                      };
                  })
                : [];

        const lastMutationIDChanges = Object.fromEntries(
            lastMutationIdRes.map((x) => [x.id, x.lastMutationId]),
        );

        const res = {
            lastMutationIDChanges,
            cookie: userRes[0].version,
            patch: [...ops],
        };

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
            JSON.stringify(body.mutations[body.mutations.length - 1]),
        );

        const db = getDb(c);

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
                    userId: clientRes[0].userId,
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

export default app;
