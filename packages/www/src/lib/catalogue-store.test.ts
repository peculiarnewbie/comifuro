import * as Schema from "effect/Schema";
import { describe, expect, test } from "bun:test";
import { TweetSyncItemSchema } from "@comifuro/core/schemas";
import { TweetId, UserId, EventId } from "@comifuro/core/schema";
import type { CatalogueTweet } from "./catalogue-store";
import { groupTweetsIntoThreads } from "./catalogue-store";

const tid = (s: string) => Schema.decodeUnknownSync(TweetId)(s);
const uid = (s: string) => Schema.decodeUnknownSync(UserId)(s);
const eid = (s: string) => Schema.decodeUnknownSync(EventId)(s);

function makeTweet(id: string, overrides: Partial<CatalogueTweet> = {}): CatalogueTweet {
    return {
        ...Schema.decodeUnknownSync(TweetSyncItemSchema)({
            id,
            eventId: "cf22",
            user: "artist",
            displayName: "Artist",
            timestamp: 1,
            text: `tweet ${id}`,
            tweetUrl: `https://x.com/artist/status/${id}`,
            matchedTags: [],
            imageMask: 1,
            classification: "catalogue",
            inferredFandoms: [],
            inferredBoothId: null,
            rootTweetId: null,
            parentTweetId: null,
            threadPosition: null,
            updatedAt: 1,
            images: [`${id}/0.webp`],
            thumbnails: [`${id}/0.thumb.webp`],
            deleted: false,
            inferredItemTypes: [],
        }),
        ...overrides,
    } as CatalogueTweet;
}

describe("groupTweetsIntoThreads", () => {
    test("groups replies under their root and sorts by thread position", () => {
        const threads = groupTweetsIntoThreads([
            makeTweet("105", {
                rootTweetId: tid("100"),
                parentTweetId: tid("101"),
                threadPosition: 2,
            }),
            makeTweet("100"),
            makeTweet("101", {
                rootTweetId: tid("100"),
                parentTweetId: tid("100"),
                threadPosition: 1,
            }),
            makeTweet("090"),
        ]);

        expect(threads.map((thread) => thread.groupId)).toEqual([tid("100"), tid("090")]);
        expect(threads[0]?.replies.map((tweet) => tweet.id)).toEqual([tid("101"), tid("105")]);
    });

    test("does not render orphaned replies without a root", () => {
        const threads = groupTweetsIntoThreads([
            makeTweet("200", {
                rootTweetId: tid("999"),
                parentTweetId: tid("999"),
                threadPosition: 1,
            }),
        ]);

        expect(threads).toEqual([]);
    });
});
