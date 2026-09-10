import * as Schema from "effect/Schema";
import {
    tweetsOperations,
    scraperOperations,
    boothsOperations,
    itemsOperations,
    userMetaOperations,
} from "@comifuro/core";
import { TweetClassificationValues, TweetId, UserId } from "@comifuro/core/schema";
import { EventId } from "@comifuro/core/schema";
import { BoothId } from "@comifuro/core/schema";
import { getDb, requirePassword } from "../auth";

import { Result, handleResult } from "../responder";
import { helpers } from "@comifuro/core";
import { buildPublicFeed } from "../helpers";
import type { AppContext } from "../types";

const NumericTweetId = TweetId.check(Schema.isPattern(/^[1-9]\d{0,19}$/));
const NonNegativeInt = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

const ScraperMedia = Schema.Struct({
    mediaIndex: NonNegativeInt.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
    r2Key: Schema.String,
    thumbnailR2Key: Schema.optional(Schema.String),
    sourceUrl: Schema.String,
    contentType: Schema.optional(Schema.String),
    width: Schema.optional(NonNegativeInt),
    height: Schema.optional(NonNegativeInt),
});

const ScraperItem = Schema.Struct({
    type: Schema.String,
    price: Schema.optional(Schema.NullOr(Schema.String)),
    fandom: Schema.optional(Schema.NullOr(Schema.String)),
});

const NullableString = Schema.NullOr(Schema.String);

const ScraperTweet = Schema.Struct({
    id: NumericTweetId,
    eventId: Schema.optional(Schema.String),
    user: UserId,
    displayName: Schema.optional(NullableString),
    timestamp: Schema.Union([Schema.Number, Schema.String]),
    text: Schema.String,
    tweetUrl: Schema.String,
    searchQuery: Schema.String,
    matchedTags: Schema.optional(Schema.Array(Schema.String)),
    imageMask: NonNegativeInt.check(Schema.isBetween({ minimum: 0, maximum: 15 })),
    classification: Schema.optional(Schema.Literals(TweetClassificationValues)),
    classificationReason: Schema.optional(NullableString),
    classifierPromptVersion: Schema.optional(NullableString),
    inferredFandoms: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
    inferredBoothId: Schema.optional(Schema.NullOr(BoothId)),
    inferredBoothIdConfidence: Schema.optional(NullableString),
    inferredItemTypes: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
    preorderDeadline: Schema.optional(NullableString),
    items: Schema.optional(Schema.Array(ScraperItem)),
    rootTweetId: Schema.optional(Schema.NullOr(NumericTweetId)),
    parentTweetId: Schema.optional(Schema.NullOr(NumericTweetId)),
    threadPosition: Schema.optional(Schema.NullOr(NonNegativeInt)),
    media: Schema.optional(Schema.Array(ScraperMedia).check(Schema.isMaxLength(4))),
});

const ScraperState = Schema.Struct({
    checkpoint: Schema.optional(Schema.NullOr(NumericTweetId)),
    startTweetId: Schema.optional(Schema.NullOr(NumericTweetId)),
    endTweetId: Schema.optional(Schema.NullOr(NumericTweetId)),
    lastSeenTweetId: Schema.optional(Schema.NullOr(NumericTweetId)),
    lastRunAt: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
});

const ExportPublicFeed = Schema.Struct({
    eventId: Schema.optional(Schema.String),
});

export async function upsertScraperTweet(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const body = await c.req.json().catch(() => null);
    let tweet: Schema.Schema.Type<typeof ScraperTweet>;
    try {
        tweet = Schema.decodeUnknownSync(ScraperTweet)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    const timestamp = helpers.toDate(tweet.timestamp);
    if (!timestamp || !Number.isFinite(timestamp.getTime()))
        return c.json({ error: "invalid tweet timestamp" }, 400);
    const mediaIndices = (tweet.media ?? []).map((media) => media.mediaIndex);
    if (new Set(mediaIndices).size !== mediaIndices.length)
        return c.json({ error: "duplicate media indices" }, 400);
    const mediaMask = mediaIndices.reduce((mask, index) => mask | (1 << index), 0);
    if (tweet.imageMask !== mediaMask)
        return c.json({ error: "imageMask must match uploaded media" }, 400);

    const now = new Date();
    const db = getDb(c);

    const eventId = helpers.normalizeEventId(tweet.eventId);
    const inferredBoothId = tweet.inferredBoothId ?? null;
    const rootTweetId = tweet.rootTweetId ?? null;
    const parentTweetId = tweet.parentTweetId ?? null;

    await tweetsOperations.upsertScrapedTweet(db, {
        tweet: {
            id: tweet.id,
            eventId,
            user: tweet.user,
            displayName: tweet.displayName ?? null,
            timestamp,
            text: tweet.text,
            tweetUrl: tweet.tweetUrl,
            searchQuery: tweet.searchQuery,
            matchedTags: [...(tweet.matchedTags ?? [])],
            imageMask: tweet.imageMask,
            classification: tweet.classification ?? "unknown",
            classificationReason: tweet.classificationReason ?? null,
            classifierPromptVersion: tweet.classifierPromptVersion ?? null,
            inferredFandoms: [...(tweet.inferredFandoms ?? [])],
            inferredBoothId: inferredBoothId,
            inferredBoothIdConfidence: tweet.inferredBoothIdConfidence ?? null,
            inferredItemTypes: [...(tweet.inferredItemTypes ?? [])],
            rootTweetId: rootTweetId,
            parentTweetId: parentTweetId,
            threadPosition: tweet.threadPosition ?? null,
            updatedAt: now,
        },
        media: (tweet.media ?? []).map((media) => ({
            tweetId: tweet.id,
            mediaIndex: media.mediaIndex,
            r2Key: media.r2Key,
            thumbnailR2Key: media.thumbnailR2Key ?? null,
            sourceUrl: media.sourceUrl,
            contentType: media.contentType,
            width: media.width,
            height: media.height,
        })),
    });

    if (tweet.classification === "catalogue") {
        if (tweet.inferredBoothId) {
            await boothsOperations.upsertBoothFromTweet(db, {
                eventId,
                inferredBoothId: inferredBoothId,
                user: tweet.user,
                displayName: tweet.displayName ?? null,
                id: tweet.id,
            });
        }

        await userMetaOperations.upsertUserMeta(db, {
            user: tweet.user,
            eventId,
            boothId: inferredBoothId,
            preorderDeadline: tweet.preorderDeadline ?? null,
        });

        if (tweet.items && tweet.items.length > 0) {
            await itemsOperations.replaceUserItems(db, {
                eventId,
                user: tweet.user,
                sourceTweetId: tweet.id,
                items: [...tweet.items],
            });
        }
    }

    return c.json({ ok: true, id: tweet.id });
}

export async function getScraperState(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const state = await scraperOperations.getState(getDb(c), c.req.param("id")!);
    return c.json(state ?? null);
}

export async function putScraperState(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const idParam = c.req.param("id");
    if (!idParam) {
        return c.json({ error: "missing id" }, 400);
    }
    const id = idParam;

    const body = await c.req.json().catch(() => null);
    let parsed: Schema.Schema.Type<typeof ScraperState>;
    try {
        parsed = Schema.decodeUnknownSync(ScraperState)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    const now = new Date();
    const [state] = await scraperOperations.upsertState(getDb(c), {
        id: id,
        checkpoint: parsed.checkpoint ?? null,
        startTweetId: parsed.startTweetId ?? null,
        endTweetId: parsed.endTweetId ?? null,
        lastSeenTweetId: parsed.lastSeenTweetId ?? null,
        lastRunAt: helpers.toDate(parsed.lastRunAt) ?? now,
        updatedAt: now,
    });

    return c.json(state);
}

export async function exportPublicFeed(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const body = await c.req.json().catch(() => null);
    let parsed: Schema.Schema.Type<typeof ExportPublicFeed>;
    try {
        parsed = Schema.decodeUnknownSync(ExportPublicFeed)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    const eventId = helpers.normalizeEventId(
        parsed.eventId,
        Schema.decodeUnknownSync(EventId)("cf22"),
    );
    const db = getDb(c);
    const payload = JSON.stringify(await buildPublicFeed(db, eventId));
    await c.env.R2.put(`${eventId}/tweets.json`, payload, {
        httpMetadata: {
            contentType: "application/json; charset=utf-8",
        },
    });

    return c.json({ ok: true, bytes: payload.length, eventId });
}
