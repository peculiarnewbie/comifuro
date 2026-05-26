import { tweetsOperations, helpers } from "@comifuro/core";
import type { SupportedDb } from "@comifuro/core";
import type { EventId } from "@comifuro/core/schema";

export const CURRENT_SCHEMA_VERSION = 9;

export async function buildPublicFeed(db: SupportedDb, eventId: EventId) {
    const publicTweets = await tweetsOperations.listPublicTweets(db, "catalogue", eventId);
    const media = await tweetsOperations.listPublicTweetMedia(
        db,
        publicTweets.map((tweet) => tweet.id),
    );

    const mediaByTweet = new Map<string, { r2Key: string; thumbnailR2Key: string | null }[]>();
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
                helpers.getFallbackImageRefs(tweet.id, tweet.imageMask);
            return [
                tweet.id,
                {
                    eventId: tweet.eventId,
                    user: tweet.user,
                    text: tweet.text,
                    url: tweet.tweetUrl,
                    matchedTags: tweet.matchedTags ?? [],
                    inferredFandoms: tweet.inferredFandoms ?? [],
                    inferredItemTypes: tweet.inferredItemTypes ?? [],
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
