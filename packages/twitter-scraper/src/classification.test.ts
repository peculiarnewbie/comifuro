import { describe, expect, test } from "bun:test";
import {
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
        });
    });
});

describe("normalizeInferredBoothId", () => {
    test("rejects invalid booth formats", () => {
        expect(normalizeInferredBoothId("A-12-3")).toBeNull();
        expect(normalizeInferredBoothId("booth A12")).toBeNull();
        expect(normalizeInferredBoothId("")).toBeNull();
    });
});
