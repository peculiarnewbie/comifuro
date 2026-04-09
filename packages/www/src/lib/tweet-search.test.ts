import { describe, expect, test } from "bun:test";
import {
    createTweetSearchText,
    createTweetThreadSearchText,
} from "./tweet-search";

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

    test("includes continuation text when building thread search text", () => {
        const searchText = createTweetThreadSearchText(
            {
                user: "artist",
                text: "catalogue part 1",
                inferredFandoms: ["Blue Archive"],
                inferredBoothId: "A12",
            },
            [
                {
                    user: "artist",
                    text: "catalogue part 2",
                    inferredFandoms: null,
                    inferredBoothId: null,
                },
            ],
        );

        expect(searchText).toContain("catalogue part 1");
        expect(searchText).toContain("catalogue part 2");
        expect(searchText).toContain("Blue Archive");
        expect(searchText).toContain("A12");
    });
});
