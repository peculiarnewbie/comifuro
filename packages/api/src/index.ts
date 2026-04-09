import { timingSafeEqual } from "node:crypto";
import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { scraperOperations, tweetsOperations } from "@comifuro/core";
import { TweetClassificationValues } from "@comifuro/core/schema";
import { TweetInsert } from "@comifuro/core/types";
import { z } from "zod";
import { pullTweets } from "./pull-tweets";
import { marksPull } from "./pull";
import { marksPush } from "./push";

type Bindings = {
    DB: D1Database;
    R2: R2Bucket;
    PASSWORD: string;
};

const imageUploadSchema = z.object({
    key: z.string().min(1),
});

const legacyTweetSchema = z.array(
    z.object({
        id: z.string().min(1),
        user: z.string().min(1),
        timestamp: z.union([z.number().int(), z.string()]),
        text: z.string(),
        imageMask: z.number().int().nonnegative(),
    }),
);

const scraperMediaSchema = z.object({
    mediaIndex: z.number().int().nonnegative(),
    r2Key: z.string().min(1),
    sourceUrl: z.string().url(),
    contentType: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
});

const scraperTweetSchema = z.object({
    id: z.string().min(1),
    user: z.string().min(1),
    displayName: z.string().nullable().optional(),
    timestamp: z.union([z.number().int(), z.string(), z.date()]),
    text: z.string(),
    tweetUrl: z.string().url(),
    searchQuery: z.string().min(1),
    matchedTags: z.array(z.string().min(1)).default([]),
    imageMask: z.number().int().nonnegative(),
    classification: z.enum(TweetClassificationValues).default("unknown"),
    classificationReason: z.string().nullable().optional(),
    classifierPromptVersion: z.string().nullable().optional(),
    media: z.array(scraperMediaSchema).default([]),
});

const scraperStateSchema = z.object({
    lastSeenTweetId: z.string().nullable().optional(),
    lastRunAt: z.union([z.number().int(), z.string(), z.date()]).nullable(),
});

const app = new Hono<{ Bindings: Bindings }>();

const currentSchemaVersion = 4;

export function getDb(c: Context<{ Bindings: Bindings }>) {
    return drizzle(c.env.DB) as DrizzleD1Database;
}

function safeEqual(actual: string | undefined, expected: string) {
    if (!actual) {
        return false;
    }

    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);

    if (actualBytes.length !== expectedBytes.length) {
        return false;
    }

    return timingSafeEqual(actualBytes, expectedBytes);
}

function requirePassword(c: Context<{ Bindings: Bindings }>) {
    const password = c.req.header("pec-password");

    if (!safeEqual(password, c.env.PASSWORD)) {
        return c.json({ error: "unauthed" }, 403);
    }

    return null;
}

function toDate(value: number | string | Date | null | undefined) {
    if (value == null) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "number") {
        return new Date(value);
    }

    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber) && `${parsedNumber}` === value) {
        return new Date(parsedNumber);
    }

    return new Date(value);
}

async function buildPublicFeed(db: DrizzleD1Database) {
    const publicTweets = await tweetsOperations.listPublicTweets(db);
    const media = await tweetsOperations.listPublicTweetMedia(
        db,
        publicTweets.map((tweet) => tweet.id),
    );

    const mediaByTweet = new Map<string, string[]>();
    for (const item of media) {
        const current = mediaByTweet.get(item.tweetId) ?? [];
        current.push(`/${item.mediaIndex}.webp`);
        mediaByTweet.set(item.tweetId, current);
    }

    return Object.fromEntries(
        publicTweets.map((tweet) => [
            tweet.id,
            {
                user: tweet.user,
                text: tweet.text,
                url: tweet.tweetUrl,
                images: mediaByTweet.get(tweet.id) ?? [],
            },
        ]),
    );
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
            if (!origin) {
                return "";
            }
            return allowed.includes(origin) ? origin : "";
        },
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: [
            "Content-Type",
            "Authorization",
            "X-Replicache-RequestID",
            "pec-password",
        ],
        exposeHeaders: ["Content-Length"],
        maxAge: 86400,
        credentials: true,
    }),
);

app.get("/", (c) => c.text("ok"))
    .post("/upload/:key", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        let decodedKey: string;
        try {
            decodedKey = decodeURIComponent(c.req.param("key"));
        } catch {
            return c.json({ error: "invalid key encoding" }, 400);
        }

        const parsedKey = imageUploadSchema.safeParse({
            key: decodedKey,
        });
        if (!parsedKey.success) {
            return c.json({ error: parsedKey.error.issues[0]?.message }, 400);
        }

        const formData = await c.req.formData();
        const file = formData.get("image");
        if (!file || typeof file === "string") {
            return c.json({ error: "no image file provided" }, 400);
        }

        await c.env.R2.put(parsedKey.data.key, file as File, {
            httpMetadata: {
                contentType: (file as File).type || "image/webp",
            },
        });

        return c.json({ ok: true, key: parsedKey.data.key });
    })
    .get("/tweets/last", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const db = getDb(c);
        const newest = await tweetsOperations.getNewestTweet(db);
        return c.json(newest[0] ?? null);
    })
    .post("/tweets/upsert", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const body = await c.req.json();
        const parsed = legacyTweetSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0]?.message }, 400);
        }

        const now = new Date();
        const rows = parsed.data.map(
            (tweet) =>
                ({
                    id: tweet.id,
                    user: tweet.user,
                    timestamp: toDate(tweet.timestamp) ?? now,
                    text: tweet.text,
                    tweetUrl: `https://x.com/i/web/status/${tweet.id}`,
                    imageMask: tweet.imageMask,
                    classification: "catalogue",
                    updatedAt: now,
                }) satisfies TweetInsert,
        );

        await tweetsOperations.upsertMultipleTweets(getDb(c), rows);
        return c.json({ ok: true, count: rows.length });
    })
    .post("/scraper/tweets/upsert", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const body = await c.req.json();
        const parsed = scraperTweetSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0]?.message }, 400);
        }

        const now = new Date();
        const db = getDb(c);
        const tweet = parsed.data;

        await tweetsOperations.upsertScrapedTweet(db, {
            tweet: {
                id: tweet.id,
                user: tweet.user,
                displayName: tweet.displayName ?? null,
                timestamp: toDate(tweet.timestamp) ?? now,
                text: tweet.text,
                tweetUrl: tweet.tweetUrl,
                searchQuery: tweet.searchQuery,
                matchedTags: tweet.matchedTags,
                imageMask: tweet.imageMask,
                classification: tweet.classification,
                classificationReason: tweet.classificationReason ?? null,
                classifierPromptVersion: tweet.classifierPromptVersion ?? null,
                updatedAt: now,
            },
            media: tweet.media.map((media) => ({
                tweetId: tweet.id,
                mediaIndex: media.mediaIndex,
                r2Key: media.r2Key,
                sourceUrl: media.sourceUrl,
                contentType: media.contentType,
                width: media.width,
                height: media.height,
            })),
        });

        return c.json({ ok: true, id: tweet.id });
    })
    .get("/scraper/state/:id", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const state = await scraperOperations.getState(getDb(c), c.req.param("id"));
        return c.json(state ?? null);
    })
    .put("/scraper/state/:id", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const body = await c.req.json();
        const parsed = scraperStateSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0]?.message }, 400);
        }

        const now = new Date();
        const [state] = await scraperOperations.upsertState(getDb(c), {
            id: c.req.param("id"),
            lastSeenTweetId: parsed.data.lastSeenTweetId ?? null,
            lastRunAt: toDate(parsed.data.lastRunAt) ?? now,
            updatedAt: now,
        });

        return c.json(state);
    })
    .post("/scraper/export-public-feed", async (c) => {
        const authError = requirePassword(c);
        if (authError) {
            return authError;
        }

        const db = getDb(c);
        const payload = JSON.stringify(await buildPublicFeed(db));
        await c.env.R2.put("tweets.json", payload, {
            httpMetadata: {
                contentType: "application/json; charset=utf-8",
            },
        });

        return c.json({ ok: true, bytes: payload.length });
    })
    .post("/replicache/tweets/pull", async (c) => {
        return await pullTweets(c, currentSchemaVersion);
    })
    .post("/replicache/pull", async (c) => {
        return await marksPull(c, currentSchemaVersion);
    })
    .post("/replicache/push", async (c) => {
        return await marksPush(c, currentSchemaVersion);
    });

export default app;
