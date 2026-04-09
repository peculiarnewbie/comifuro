import { Hono } from "hono";
import type { Context } from "hono";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { scraperOperations, tweetsOperations } from "@comifuro/core";
import { TweetClassificationValues } from "@comifuro/core/schema";
import type {
    TweetInsert,
    TweetSyncCursor,
    TweetSyncItem,
    TweetSyncResponse,
} from "@comifuro/core/types";
import { z } from "zod";

export type WorkerBindings = {
    ASSETS: Fetcher;
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
        eventId: z.string().min(1).optional(),
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
    eventId: z.string().min(1).default("cf21"),
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

const exportPublicFeedSchema = z.object({
    eventId: z.string().min(1).optional(),
});

const currentSchemaVersion = 7;

type AppContext = Context<{ Bindings: WorkerBindings }>;

function getDb(c: AppContext) {
    return drizzle(c.env.DB) as DrizzleD1Database;
}

function safeEqual(actual: string | undefined, expected: string | undefined) {
    if (!actual || !expected) {
        return false;
    }

    const encoder = new TextEncoder();
    const actualBytes = encoder.encode(actual);
    const expectedBytes = encoder.encode(expected);
    const maxLength = Math.max(actualBytes.length, expectedBytes.length);
    let mismatch = actualBytes.length === expectedBytes.length ? 0 : 1;

    for (let index = 0; index < maxLength; index += 1) {
        mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
    }

    return mismatch === 0;
}

function requirePassword(c: AppContext) {
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

function normalizeEventId(value: string | null | undefined, fallback = "cf21") {
    return value?.trim().toLowerCase() || fallback;
}

function maskToFallbackR2Keys(tweetId: string, mask: number, maxBits = 8) {
    const keys: string[] = [];

    for (let index = 0; index < maxBits; index += 1) {
        if ((mask & (1 << index)) !== 0) {
            keys.push(`${tweetId}/${index}.webp`);
        }
    }

    return keys;
}

function toNumberParam(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

async function buildPublicFeed(db: DrizzleD1Database, eventId: string) {
    const publicTweets = await tweetsOperations.listPublicTweets(
        db,
        "catalogue",
        eventId,
    );
    const media = await tweetsOperations.listPublicTweetMedia(
        db,
        publicTweets.map((tweet) => tweet.id),
    );

    const mediaByTweet = new Map<string, string[]>();
    for (const item of media) {
        const current = mediaByTweet.get(item.tweetId) ?? [];
        current.push(item.r2Key);
        mediaByTweet.set(item.tweetId, current);
    }

    return Object.fromEntries(
        publicTweets.map((tweet) => [
            tweet.id,
            {
                eventId: tweet.eventId,
                user: tweet.user,
                text: tweet.text,
                url: tweet.tweetUrl,
                images:
                    mediaByTweet.get(tweet.id) ??
                    maskToFallbackR2Keys(tweet.id, tweet.imageMask),
            },
        ]),
    );
}

const api = new Hono<{ Bindings: WorkerBindings }>();

api.get("/", (c) => c.text("ok"))
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
    .get("/tweets/sync", async (c) => {
        const eventId = normalizeEventId(c.req.query("eventId"), "cf22");
        const limit = Math.min(
            Math.max(Number(c.req.query("limit") ?? 500), 1),
            1000,
        );
        const cursorUpdatedAt = toNumberParam(c.req.query("cursorUpdatedAt"));
        const cursorId = c.req.query("cursorId");

        const cursor =
            cursorUpdatedAt != null && cursorId
                ? ({
                      updatedAt: cursorUpdatedAt,
                      id: cursorId,
                  } satisfies TweetSyncCursor)
                : undefined;

        const db = getDb(c);
        const rows = await tweetsOperations.listTweetsForSync(db, {
            eventId,
            cursor,
            limit: limit + 1,
        });

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        const imagesByTweet = await tweetsOperations.listTweetImages(
            db,
            pageRows.map((row) => ({
                id: row.id,
                imageMask: row.imageMask,
            })),
        );

        const items = pageRows.map(
            (row) =>
                ({
                    id: row.id,
                    eventId: row.eventId,
                    user: row.user,
                    displayName: row.displayName,
                    timestamp: row.timestamp.getTime(),
                    text: row.text,
                    tweetUrl: row.tweetUrl,
                    imageMask: row.imageMask,
                    classification: row.classification,
                    inferredFandoms: Array.isArray(row.inferredFandoms)
                        ? row.inferredFandoms
                        : [],
                    inferredFandomsConfidence:
                        row.inferredFandomsConfidence ?? null,
                    inferredBoothId: row.inferredBoothId ?? null,
                    inferredBoothIdConfidence:
                        row.inferredBoothIdConfidence ?? null,
                    updatedAt: (row.updatedAt ?? row.createdAt).getTime(),
                    deleted:
                        Boolean(row.deleted) ||
                        row.classification !== "catalogue" ||
                        row.imageMask <= 0,
                    images: imagesByTweet.get(row.id) ?? [],
                }) satisfies TweetSyncItem,
        );

        const lastItem = items[items.length - 1];
        const response = {
            eventId,
            syncToken: `${currentSchemaVersion}:${eventId}`,
            items,
            nextCursor: lastItem
                ? {
                      updatedAt: lastItem.updatedAt,
                      id: lastItem.id,
                  }
                : null,
            hasMore,
            serverTime: Date.now(),
        } satisfies TweetSyncResponse;

        c.header("Cache-Control", "no-store");
        return c.json(response);
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
                    eventId: normalizeEventId(tweet.eventId),
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
                eventId: normalizeEventId(tweet.eventId),
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

        const body = await c.req.json().catch(() => ({}));
        const parsed = exportPublicFeedSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0]?.message }, 400);
        }

        const eventId = normalizeEventId(parsed.data.eventId, "cf22");
        const db = getDb(c);
        const payload = JSON.stringify(await buildPublicFeed(db, eventId));
        await c.env.R2.put(`${eventId}/tweets.json`, payload, {
            httpMetadata: {
                contentType: "application/json; charset=utf-8",
            },
        });

        return c.json({ ok: true, bytes: payload.length, eventId });
    });

export const workerApp = new Hono<{ Bindings: WorkerBindings }>().route("/api", api);
