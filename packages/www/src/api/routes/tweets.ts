import * as Schema from "effect/Schema";
import { tweetsOperations } from "@comifuro/core";
import type { TweetInsert } from "@comifuro/core/types";
import { TweetSyncResponse as TweetSyncResponseSchema } from "@comifuro/core/schemas";
import { TweetId, UserId, EventId } from "@comifuro/core/schema";
import { getDb, requirePassword } from "../auth";
import { InternalError } from "../errors";
import { Result, handleResult } from "../responder";
import { validate } from "../responder";
import { helpers } from "@comifuro/core";
import { CURRENT_SCHEMA_VERSION } from "../helpers";
import type { AppContext } from "../types";

const LegacyTweet = Schema.Struct({
    id: TweetId,
    eventId: Schema.optional(Schema.String),
    user: UserId,
    timestamp: Schema.Union([Schema.Number, Schema.String]),
    text: Schema.String,
    imageMask: Schema.Number,
});

const legacyTweetSchema = Schema.Array(LegacyTweet);

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
    const eventId = helpers.normalizeEventId(
        c.req.query("eventId"),
        Schema.decodeUnknownSync(EventId)("cf22"),
    );
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 500), 1), 1000);
    const cursorUpdatedAt = helpers.toNumberParam(c.req.query("cursorUpdatedAt"));
    const cursorId = c.req.query("cursorId");

    let cursorIdValue: TweetId | undefined;
    if (cursorId) {
        const cursorIdResult = validate(TweetId, cursorId);
        if (Result.isError(cursorIdResult)) {
            return c.json({ error: cursorIdResult.error.message }, 400);
        }
        cursorIdValue = cursorIdResult.value;
    }

    try {
        const db = getDb(c);
        const rows = await tweetsOperations.listTweetsForSync(db, {
            eventId,
            cursor:
                cursorUpdatedAt != null && cursorIdValue
                    ? {
                          updatedAt: cursorUpdatedAt,
                          id: cursorIdValue,
                      }
                    : undefined,
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
                matchedTags: Array.isArray(row.matchedTags) ? row.matchedTags : [],
                imageMask: row.imageMask,
                classification: row.classification,
                inferredFandoms: Array.isArray(row.inferredFandoms) ? row.inferredFandoms : [],
                inferredItemTypes: Array.isArray(row.inferredItemTypes)
                    ? row.inferredItemTypes
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
            };
        });

        const lastItem = items[items.length - 1];
        const response = Schema.decodeUnknownSync(TweetSyncResponseSchema)({
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
        });

        c.header("Cache-Control", "no-store");
        return c.json(response);
    } catch (error) {
        console.error("[tweets/sync] error", { eventId, cursorId }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message: error instanceof Error ? error.message : "sync failed",
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
    let parsed: Schema.Schema.Type<typeof legacyTweetSchema>;
    try {
        parsed = Schema.decodeUnknownSync(legacyTweetSchema)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    const now = new Date();
    const rows = parsed.map(
        (tweet) =>
            ({
                id: tweet.id,
                eventId: helpers.normalizeEventId(tweet.eventId),
                user: tweet.user,
                timestamp: helpers.toDate(tweet.timestamp) ?? now,
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
