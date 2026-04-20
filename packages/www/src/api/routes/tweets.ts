import { z } from "zod";
import { Result } from "better-result";
import { tweetsOperations } from "@comifuro/core";
import type {
    TweetInsert,
    TweetSyncCursor,
    TweetSyncItem,
    TweetSyncResponse,
} from "@comifuro/core/types";
import { getDb, requirePassword } from "../auth";
import { ValidationError, InternalError } from "../errors";
import { handleResult } from "../responder";
import {
    CURRENT_SCHEMA_VERSION,
    toDate,
    normalizeEventId,
    toNumberParam,
    buildPublicFeed,
} from "../helpers";
import type { AppContext } from "../types";

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

export async function getLastTweet(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const db = getDb(c);
    const newest = await tweetsOperations.getNewestTweet(db);
    return c.json(newest[0] ?? null);
}

export async function syncTweets(c: AppContext) {
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

    try {
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

        const items = pageRows.map((row) => {
            const refs = imagesByTweet.get(row.id) ?? [];
            return {
                id: row.id,
                eventId: row.eventId,
                user: row.user,
                displayName: row.displayName,
                timestamp: row.timestamp.getTime(),
                text: row.text,
                tweetUrl: row.tweetUrl,
                matchedTags: Array.isArray(row.matchedTags)
                    ? row.matchedTags
                    : [],
                imageMask: row.imageMask,
                classification: row.classification,
                inferredFandoms: Array.isArray(row.inferredFandoms)
                    ? row.inferredFandoms
                    : [],
                inferredBoothId: row.inferredBoothId ?? null,
                rootTweetId: row.rootTweetId ?? null,
                parentTweetId: row.parentTweetId ?? null,
                threadPosition: row.threadPosition ?? null,
                updatedAt: (row.updatedAt ?? row.createdAt).getTime(),
                deleted:
                    Boolean(row.deleted) ||
                    row.classification !== "catalogue" ||
                    row.imageMask <= 0,
                images: refs.map((ref) => ref.r2Key),
                thumbnails: refs.map((ref) => ref.thumbnailR2Key),
            } satisfies TweetSyncItem;
        });

        const lastItem = items[items.length - 1];
        const response = {
            eventId,
            syncToken: `${CURRENT_SCHEMA_VERSION}:${eventId}`,
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
    } catch (error) {
        console.error("[tweets/sync] error", { eventId, cursor }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "sync failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function upsertLegacyTweets(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
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
}
