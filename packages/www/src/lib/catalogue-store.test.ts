import { describe, expect, test } from "bun:test";
import type { CatalogueTweet } from "./catalogue-store";
import { groupTweetsIntoThreads } from "./catalogue-store";

function makeTweet(
    id: string,
    overrides: Partial<CatalogueTweet> = {},
): CatalogueTweet {
    return {
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
        ...overrides,
    };
}

describe("groupTweetsIntoThreads", () => {
    test("groups replies under their root and sorts by thread position", () => {
        const threads = groupTweetsIntoThreads([
            makeTweet("105", {
                rootTweetId: "100",
                parentTweetId: "101",
                threadPosition: 2,
            }),
            makeTweet("100"),
            makeTweet("101", {
                rootTweetId: "100",
                parentTweetId: "100",
                threadPosition: 1,
            }),
            makeTweet("090"),
        ]);

        expect(threads.map((thread) => thread.groupId)).toEqual(["100", "090"]);
        expect(threads[0]?.replies.map((tweet) => tweet.id)).toEqual([
            "101",
            "105",
        ]);
    });

    test("does not render orphaned replies without a root", () => {
        const threads = groupTweetsIntoThreads([
            makeTweet("200", {
                rootTweetId: "999",
                parentTweetId: "999",
                threadPosition: 1,
            }),
        ]);

        expect(threads).toEqual([]);
    });
});
