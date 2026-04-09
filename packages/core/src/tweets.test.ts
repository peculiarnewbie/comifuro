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
                inferredFandomsConfidence: "medium",
                inferredBoothId: "A12",
                inferredBoothIdConfidence: "high",
                updatedAt,
            },
        ]);

        const stored = await tweetsOperations.getTweet(db, "1");
        const syncRows = await tweetsOperations.listTweetsForSync(db, {
            eventId: "cf22",
            limit: 10,
        });

        expect(stored?.inferredFandoms).toEqual(["Blue Archive"]);
        expect(stored?.inferredFandomsConfidence).toBe("medium");
        expect(stored?.inferredBoothId).toBe("A12");
        expect(stored?.inferredBoothIdConfidence).toBe("high");
        expect(syncRows[0]?.inferredFandoms).toEqual(["Blue Archive"]);
        expect(syncRows[0]?.inferredBoothId).toBe("A12");
    });
});
