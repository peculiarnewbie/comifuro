import { z } from "zod";
import { Result } from "better-result";
import { tweetsOperations, scraperOperations } from "@comifuro/core";
import { TweetClassificationValues } from "@comifuro/core/schema";
import { getDb, requirePassword } from "../auth";
import { ValidationError, InternalError } from "../errors";
import { handleResult } from "../responder";
import {
    toDate,
    normalizeEventId,
    normalizeTagList,
    buildPublicFeed,
} from "../helpers";
import type { AppContext } from "../types";

const scraperMediaSchema = z.object({
    mediaIndex: z.number().int().nonnegative(),
    r2Key: z.string().min(1),
    thumbnailR2Key: z.string().min(1).optional(),
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
    inferredFandoms: z.array(z.string().min(1)).nullable().optional(),
    inferredBoothId: z.string().min(1).nullable().optional(),
    rootTweetId: z.string().min(1).nullable().optional(),
    parentTweetId: z.string().min(1).nullable().optional(),
    threadPosition: z.number().int().positive().nullable().optional(),
    media: z.array(scraperMediaSchema).default([]),
});

const scraperStateSchema = z.object({
    lastSeenTweetId: z.string().nullable().optional(),
    lastRunAt: z.union([z.number().int(), z.string(), z.date()]).nullable(),
});

const exportPublicFeedSchema = z.object({
    eventId: z.string().min(1).optional(),
});

export async function upsertScraperTweet(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
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
            inferredFandoms: tweet.inferredFandoms ?? [],
            inferredBoothId: tweet.inferredBoothId ?? null,
            rootTweetId: tweet.rootTweetId ?? null,
            parentTweetId: tweet.parentTweetId ?? null,
            threadPosition: tweet.threadPosition ?? null,
            updatedAt: now,
        },
        media: tweet.media.map((media) => ({
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

    const body = await c.req.json();
    const parsed = scraperStateSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }

    const now = new Date();
    const [state] = await scraperOperations.upsertState(getDb(c), {
        id: c.req.param("id")!,
        lastSeenTweetId: parsed.data.lastSeenTweetId ?? null,
        lastRunAt: toDate(parsed.data.lastRunAt) ?? now,
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
}
