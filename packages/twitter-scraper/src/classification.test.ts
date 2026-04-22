import { describe, expect, test } from "bun:test";
import {
    extractBoothIdsFromText,
    normalizeInferredBoothId,
    parseClassificationResponse,
} from "./classification";

describe("parseClassificationResponse", () => {
    test("accepts fenced JSON and normalizes extracted metadata", () => {
        const parsed = parseClassificationResponse(`
            \`\`\`json
            {
              "isCatalogue": true,
              "reason": "catalogue post",
              "inferredFandoms": [" Blue Archive ", "blue archive", "", "Project Sekai"],
              "inferredBoothId": " a12 "
            }
            \`\`\`
        `);

        expect(parsed).toEqual({
            isCatalogue: true,
            reason: "catalogue post",
            inferredFandoms: ["Blue Archive", "Project Sekai"],
            inferredBoothId: "A12",
            inferredBoothIdConfidence: null,
        });
    });

    test("defaults empty or invalid metadata to bonus-only nullish values", () => {
        const parsed = parseClassificationResponse(
            JSON.stringify({
                isCatalogue: true,
                reason: "uncertain",
                inferredFandoms: ["", "   "],
                inferredBoothId: "table near entrance",
            }),
        );

        expect(parsed.inferredFandoms).toEqual([]);
        expect(parsed.inferredBoothId).toBeNull();
    });

    test("tolerates string nulls and bonus metadata format drift", () => {
        const parsed = parseClassificationResponse(
            JSON.stringify({
                isCatalogue: true,
                reason: "catalogue post",
                inferredFandoms: "Blue Archive",
                inferredBoothId: "null",
            }),
        );

        expect(parsed).toEqual({
            isCatalogue: true,
            reason: "catalogue post",
            inferredFandoms: ["Blue Archive"],
            inferredBoothId: null,
            inferredBoothIdConfidence: null,
        });
    });
});

describe("extractBoothIdsFromText", () => {
    test("finds booth codes in free-form text", () => {
        expect(
            extractBoothIdsFromText("Come visit us at booth E-31a!"),
        ).toEqual(["E-31A"]);
        expect(
            extractBoothIdsFromText("We are at A12 and B-58b today"),
        ).toEqual(["A-12", "B-58B"]);
    });

    test("returns empty array when no booth codes are present", () => {
        expect(extractBoothIdsFromText("Just some random text")).toEqual([]);
    });

    test("deduplicates multiple mentions of the same booth", () => {
        expect(
            extractBoothIdsFromText("E-31a and E-31a again"),
        ).toEqual(["E-31A"]);
    });
});

describe("normalizeInferredBoothId", () => {
    test("rejects invalid booth formats", () => {
        expect(normalizeInferredBoothId("A-12-3")).toBeNull();
        expect(normalizeInferredBoothId("booth A12")).toBeNull();
        expect(normalizeInferredBoothId("")).toBeNull();
    });
});
