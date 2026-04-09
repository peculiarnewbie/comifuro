import { describe, expect, test } from "bun:test";
import { buildThreadContinuationChain } from "./browser";
import type { ExtractedTweet } from "./types";

function makeTweet(
    id: string,
    overrides: Partial<ExtractedTweet> = {},
): ExtractedTweet {
    return {
        id,
        user: "artist",
        displayName: "Artist",
        text: `tweet ${id}`,
        tweetUrl: `https://x.com/artist/status/${id}`,
        timestamp: "2026-04-09T12:00:00.000Z",
        matchedTags: ["#cf22"],
        previewImageUrls: [`https://pbs.twimg.com/media/${id}.jpg`],
        hasQuotedTweet: false,
        rootTweetId: null,
        parentTweetId: null,
        threadPosition: null,
        discoverySource: "search",
        ...overrides,
    };
}

describe("buildThreadContinuationChain", () => {
    test("keeps same-author image replies after the root in order", () => {
        const root = makeTweet("100");
        const result = buildThreadContinuationChain(root, [
            makeTweet("099"),
            root,
            makeTweet("101"),
            makeTweet("102"),
        ]);

        expect(result.rootFound).toBe(true);
        expect(result.chain.map((tweet) => tweet.id)).toEqual(["101", "102"]);
        expect(result.chain.map((tweet) => tweet.parentTweetId)).toEqual([
            "100",
            "101",
        ]);
        expect(result.chain.map((tweet) => tweet.threadPosition)).toEqual([1, 2]);
    });

    test("skips text-only, mixed-author, quoted, and duplicate replies", () => {
        const root = makeTweet("100");
        const result = buildThreadContinuationChain(root, [
            root,
            makeTweet("101", { previewImageUrls: [] }),
            makeTweet("102", { user: "other-artist" }),
            makeTweet("103", { hasQuotedTweet: true }),
            makeTweet("104"),
            makeTweet("104"),
        ]);

        expect(result.chain.map((tweet) => tweet.id)).toEqual(["104"]);
        expect(result.skipped.textOnly).toBe(1);
        expect(result.skipped.mixedAuthor).toBe(1);
        expect(result.skipped.quoted).toBe(1);
        expect(result.skipped.duplicate).toBe(1);
    });
});
