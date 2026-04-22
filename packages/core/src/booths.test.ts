import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getBunSqlite } from "./db";
import { tweetsOperations, boothsOperations } from "./index";
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

describe("boothsOperations", () => {
    test("upserts a booth from a catalogue tweet", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);

        await tweetsOperations.upsertMultipleTweets(db, [
            {
                id: "1",
                eventId: "cf22",
                user: "artist",
                displayName: "Artist",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "Blue Archive at E-31a",
                tweetUrl: "https://x.com/i/web/status/1",
                imageMask: 1,
                classification: "catalogue",
                inferredBoothId: "E-31A",
                updatedAt: new Date("2026-04-09T10:01:00.000Z"),
            },
        ]);

        await boothsOperations.upsertBoothFromTweet(db, {
            eventId: "cf22",
            inferredBoothId: "E-31A",
            user: "artist",
            displayName: "Artist",
            id: "1",
        });

        const booth = await boothsOperations.getBooth(db, "cf22", "E-31A");
        expect(booth).not.toBeNull();
        expect(booth?.section).toBe("E");
        expect(booth?.status).toBe("occupied");
        expect(booth?.exhibitorUser).toBe("artist");
        expect(booth?.primaryTweetId).toBe("1");
    });

    test("rebuilds booths from all catalogue tweets", async () => {
        const dbPath = createTempDbPath();
        runBunMigrations(dbPath);

        const db = getBunSqlite(dbPath);

        await tweetsOperations.upsertMultipleTweets(db, [
            {
                id: "1",
                eventId: "cf22",
                user: "artist1",
                displayName: "Artist One",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "Booth E-31a",
                tweetUrl: "https://x.com/i/web/status/1",
                imageMask: 1,
                classification: "catalogue",
                inferredBoothId: "E-31A",
                updatedAt: new Date("2026-04-09T10:01:00.000Z"),
            },
            {
                id: "2",
                eventId: "cf22",
                user: "artist2",
                displayName: "Artist Two",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "Booth A-12",
                tweetUrl: "https://x.com/i/web/status/2",
                imageMask: 1,
                classification: "catalogue",
                inferredBoothId: "A-12",
                updatedAt: new Date("2026-04-09T10:02:00.000Z"),
            },
            {
                id: "3",
                eventId: "cf22",
                user: "artist3",
                displayName: "Artist Three",
                timestamp: new Date("2026-04-09T10:00:00.000Z"),
                text: "No booth here",
                tweetUrl: "https://x.com/i/web/status/3",
                imageMask: 1,
                classification: "catalogue",
                updatedAt: new Date("2026-04-09T10:03:00.000Z"),
            },
        ]);

        const inserted = await boothsOperations.rebuildBoothsFromTweets(
            db,
            "cf22",
        );
        expect(inserted).toHaveLength(2);

        const allBooths = await boothsOperations.listBooths(db, "cf22");
        expect(allBooths).toHaveLength(2);

        const boothA12 = await boothsOperations.getBoothWithTweets(
            db,
            "cf22",
            "A-12",
        );
        expect(boothA12.booth?.exhibitorUser).toBe("artist2");
        expect(boothA12.tweets).toHaveLength(1);
    });
});
