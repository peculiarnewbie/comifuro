import { describe, expect, test } from "bun:test";
import { createTweetSearchText } from "./tweet-search";

describe("createTweetSearchText", () => {
    test("includes inferred fandoms and booth id in searchable text", () => {
        const searchText = createTweetSearchText({
            user: "artist",
            text: "new catalogue",
            inferredFandoms: ["Blue Archive", "Project Sekai"],
            inferredBoothId: "A12",
        });

        expect(searchText).toContain("artist");
        expect(searchText).toContain("new catalogue");
        expect(searchText).toContain("Blue Archive");
        expect(searchText).toContain("Project Sekai");
        expect(searchText).toContain("A12");
    });

    test("handles legacy rows without inferred metadata", () => {
        const searchText = createTweetSearchText({
            user: "artist",
            text: "new catalogue",
            inferredFandoms: null,
            inferredBoothId: null,
        });

        expect(searchText).toBe("artist\nnew catalogue");
    });
});
