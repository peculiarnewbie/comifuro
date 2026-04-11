import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getBunSqlite } from "./db";
import { tweetsOperations } from "./index";
import { runBunMigrations } from "./migrate";

const tempPaths: string[] = [];

afterEach(() => {
    for (const filePath of tempPaths.splice(0)) {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
    }
});

function createTempDbPath() {
    const filePath = join(tmpdir(), `comifuro-${randomUUID()}.sqlite`);
    tempPaths.push(filePath);
    return filePath;
}

describe("tweetsOperations inferred metadata", () => {
    test("persists inferred metadata and returns it from sync queries", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);
        const updatedAt = new Date("2026-04-09T12:00:00.000Z");

        await tweetsOperations.upsertMultipleTweets(db, [
            {
                id: "1",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "Blue Archive at A12",
                tweetUrl: "https://x.com/i/web/status/1",
                imageMask: 1,
                classification: "catalogue",
                inferredFandoms: ["Blue Archive"],
                inferredBoothId: "A12",
                updatedAt,
            },
        ]);

        const stored = await tweetsOperations.getTweet(db, "1");
        const syncRows = await tweetsOperations.listTweetsForSync(db, {
            eventId: "cf22",
            limit: 10,
        });

        expect(stored?.inferredFandoms).toEqual(["Blue Archive"]);
        expect(stored?.inferredBoothId).toBe("A12");
        expect(syncRows[0]?.inferredFandoms).toEqual(["Blue Archive"]);
        expect(syncRows[0]?.inferredBoothId).toBe("A12");
    });

    test("keeps stronger catalogue state, media, and thread metadata on weaker upserts", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);

        await tweetsOperations.upsertScrapedTweet(db, {
            tweet: {
                id: "200",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "thread reply with images",
                tweetUrl: "https://x.com/artist/status/200",
                searchQuery: "#cf22 filter:images",
                matchedTags: ["#cf22"],
                imageMask: 1,
                classification: "catalogue",
                classificationReason: "inherited from root 100",
                classifierPromptVersion: "prompt-v1",
                rootTweetId: "100",
                parentTweetId: "150",
                threadPosition: 2,
                updatedAt: new Date("2026-04-09T10:01:00.000Z"),
            },
            media: [
                {
                    tweetId: "200",
                    mediaIndex: 0,
                    r2Key: "200/0.webp",
                    sourceUrl: "https://pbs.twimg.com/media/example",
                    contentType: "image/webp",
                },
            ],
        });

        await tweetsOperations.upsertScrapedTweet(db, {
            tweet: {
                id: "200",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "part 2",
                tweetUrl: "https://x.com/artist/status/200",
                searchQuery: "#cf22 filter:images",
                matchedTags: ["#cf22"],
                imageMask: 0,
                classification: "not_catalogue",
                classificationReason: "ambiguous reply",
                classifierPromptVersion: "prompt-v2",
                rootTweetId: null,
                parentTweetId: null,
                threadPosition: null,
                updatedAt: new Date("2026-04-09T10:02:00.000Z"),
            },
            media: [],
        });

        const stored = await tweetsOperations.getTweet(db, "200");
        const media = await tweetsOperations.listTweetMedia(db, "200");

        expect(stored?.classification).toBe("catalogue");
        expect(stored?.classificationReason).toBe("inherited from root 100");
        expect(stored?.classifierPromptVersion).toBe("prompt-v1");
        expect(stored?.imageMask).toBe(1);
        expect(stored?.rootTweetId).toBe("100");
        expect(stored?.parentTweetId).toBe("150");
        expect(stored?.threadPosition).toBe(2);
        expect(media).toHaveLength(1);
        expect(media[0]?.r2Key).toBe("200/0.webp");
    });

    test("upgrades a reply from ambiguous to catalogue when thread data arrives later", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);

        await tweetsOperations.upsertScrapedTweet(db, {
            tweet: {
                id: "201",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:05:00.000Z"),
                text: "part 3",
                tweetUrl: "https://x.com/artist/status/201",
                searchQuery: "#cf22 filter:images",
                matchedTags: ["#cf22"],
                imageMask: 0,
                classification: "not_catalogue",
                classificationReason: "too little context",
                classifierPromptVersion: "prompt-v1",
                updatedAt: new Date("2026-04-09T10:06:00.000Z"),
            },
            media: [],
        });

        await tweetsOperations.upsertScrapedTweet(db, {
            tweet: {
                id: "201",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:05:00.000Z"),
                text: "part 3",
                tweetUrl: "https://x.com/artist/status/201",
                searchQuery: "#cf22 filter:images",
                matchedTags: ["#cf22"],
                imageMask: 1,
                classification: "catalogue",
                classificationReason: "inherited from root 100",
                classifierPromptVersion: "prompt-v1",
                rootTweetId: "100",
                parentTweetId: "200",
                threadPosition: 3,
                updatedAt: new Date("2026-04-09T10:07:00.000Z"),
            },
            media: [
                {
                    tweetId: "201",
                    mediaIndex: 0,
                    r2Key: "201/0.webp",
                    sourceUrl: "https://pbs.twimg.com/media/example-2",
                    contentType: "image/webp",
                },
            ],
        });

        const stored = await tweetsOperations.getTweet(db, "201");
        const media = await tweetsOperations.listTweetMedia(db, "201");

        expect(stored?.classification).toBe("catalogue");
        expect(stored?.imageMask).toBe(1);
        expect(stored?.rootTweetId).toBe("100");
        expect(stored?.parentTweetId).toBe("200");
        expect(stored?.threadPosition).toBe(3);
        expect(media).toHaveLength(1);
    });

    test("allows manual admin updates for fandoms, rerooting, and uncataloguing", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);

        await tweetsOperations.upsertMultipleTweets(db, [
            {
                id: "300",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "root",
                tweetUrl: "https://x.com/artist/status/300",
                matchedTags: ["initial"],
                imageMask: 1,
                classification: "catalogue",
                inferredFandoms: ["Blue Archive"],
                updatedAt: new Date("2026-04-09T10:01:00.000Z"),
            },
            {
                id: "301",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:02:00.000Z"),
                text: "reply one",
                tweetUrl: "https://x.com/artist/status/301",
                imageMask: 1,
                classification: "catalogue",
                rootTweetId: "300",
                parentTweetId: "300",
                threadPosition: 1,
                inferredFandoms: [],
                updatedAt: new Date("2026-04-09T10:03:00.000Z"),
            },
            {
                id: "302",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:04:00.000Z"),
                text: "reply two",
                tweetUrl: "https://x.com/artist/status/302",
                imageMask: 1,
                classification: "catalogue",
                rootTweetId: "300",
                parentTweetId: "301",
                threadPosition: 2,
                inferredFandoms: [],
                updatedAt: new Date("2026-04-09T10:05:00.000Z"),
            },
        ]);

        await tweetsOperations.updateTweetAdminMetadata(db, {
            id: "300",
            matchedTags: ["manual", "featured"],
            inferredFandoms: ["Uma Musume", "Blue Archive"],
            updatedAt: new Date("2026-04-09T11:00:00.000Z"),
        });

        await tweetsOperations.rerootThread(db, {
            rootTweetId: "300",
            newRootTweetId: "302",
            updatedAt: new Date("2026-04-09T11:05:00.000Z"),
        });

        await tweetsOperations.manualUncatalogueTweet(db, {
            id: "301",
            reason: "removed from follow ups manually",
            updatedAt: new Date("2026-04-09T11:10:00.000Z"),
        });

        const rerootedRoot = await tweetsOperations.getTweet(db, "302");
        const oldRoot = await tweetsOperations.getTweet(db, "300");
        const removedReply = await tweetsOperations.getTweet(db, "301");

        expect(oldRoot?.matchedTags).toEqual(["manual", "featured"]);
        expect(oldRoot?.inferredFandoms).toEqual(["Uma Musume", "Blue Archive"]);
        expect(rerootedRoot?.rootTweetId).toBeNull();
        expect(rerootedRoot?.parentTweetId).toBeNull();
        expect(rerootedRoot?.threadPosition).toBeNull();
        expect(oldRoot?.rootTweetId).toBe("302");
        expect(oldRoot?.parentTweetId).toBe("302");
        expect(oldRoot?.threadPosition).toBe(1);
        expect(removedReply?.classification).toBe("not_catalogue");
        expect(removedReply?.rootTweetId).toBeNull();
        expect(removedReply?.parentTweetId).toBeNull();
        expect(removedReply?.threadPosition).toBeNull();
    });
});
