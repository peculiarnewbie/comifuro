import { DrizzleD1Database } from "drizzle-orm/d1";
import { tweetsOperations } from "@comifuro/core";
import type { TweetSyncCursor } from "@comifuro/core/types";

export const TWEET_MEDIA_KEY_REGEX = /^[A-Za-z0-9_-]+\/\d+\.webp$/;
export const CURRENT_SCHEMA_VERSION = 9;

export function toDate(value: number | string | Date | null | undefined) {
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

export function normalizeEventId(
    value: string | null | undefined,
    fallback = "cf21",
) {
    return value?.trim().toLowerCase() || fallback;
}

export function normalizeTagList(values: string[] | undefined) {
    if (values === undefined) {
        return undefined;
    }

    return Array.from(
        new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
}

export function maskToFallbackR2Keys(
    tweetId: string,
    mask: number,
    maxBits = 8,
) {
    const keys: string[] = [];

    for (let index = 0; index < maxBits; index += 1) {
        if ((mask & (1 << index)) !== 0) {
            keys.push(`${tweetId}/${index}.webp`);
        }
    }

    return keys;
}

export function toNumberParam(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export async function buildPublicFeed(
    db: DrizzleD1Database,
    eventId: string,
) {
    const publicTweets = await tweetsOperations.listPublicTweets(
        db,
        "catalogue",
        eventId,
    );
    const media = await tweetsOperations.listPublicTweetMedia(
        db,
        publicTweets.map((tweet) => tweet.id),
    );

    const mediaByTweet = new Map<
        string,
        { r2Key: string; thumbnailR2Key: string | null }[]
    >();
    for (const item of media) {
        const current = mediaByTweet.get(item.tweetId) ?? [];
        current.push({
            r2Key: item.r2Key,
            thumbnailR2Key: item.thumbnailR2Key ?? null,
        });
        mediaByTweet.set(item.tweetId, current);
    }

    return Object.fromEntries(
        publicTweets.map((tweet) => {
            const refs =
                mediaByTweet.get(tweet.id) ??
                maskToFallbackR2Keys(tweet.id, tweet.imageMask).map((key) => ({
                    r2Key: key,
                    thumbnailR2Key: null,
                }));
            return [
                tweet.id,
                {
                    eventId: tweet.eventId,
                    user: tweet.user,
                    text: tweet.text,
                    url: tweet.tweetUrl,
                    matchedTags: tweet.matchedTags ?? [],
                    inferredFandoms: tweet.inferredFandoms ?? [],
                    inferredBoothId: tweet.inferredBoothId ?? null,
                    rootTweetId: tweet.rootTweetId ?? null,
                    parentTweetId: tweet.parentTweetId ?? null,
                    threadPosition: tweet.threadPosition ?? null,
                    images: refs.map((ref) => ref.r2Key),
                    thumbnails: refs.map((ref) => ref.thumbnailR2Key),
                },
            ];
        }),
    );
}
