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
              "confidence": "high",
              "reason": "catalogue post",
              "inferredFandoms": [" Blue Archive ", "blue archive", "", "Project Sekai"],
              "inferredFandomsConfidence": "medium",
              "inferredBoothId": " a12 ",
              "inferredBoothIdConfidence": "low"
            }
            \`\`\`
        `);

        expect(parsed).toEqual({
            isCatalogue: true,
            confidence: "high",
            reason: "catalogue post",
            inferredFandoms: ["Blue Archive", "Project Sekai"],
            inferredFandomsConfidence: "medium",
            inferredBoothId: "A12",
            inferredBoothIdConfidence: "low",
        });
    });

    test("defaults empty or invalid metadata to bonus-only nullish values", () => {
        const parsed = parseClassificationResponse(
            JSON.stringify({
                isCatalogue: true,
                confidence: "low",
                reason: "uncertain",
                inferredFandoms: ["", "   "],
                inferredFandomsConfidence: "high",
                inferredBoothId: "table near entrance",
                inferredBoothIdConfidence: "medium",
            }),
        );

        expect(parsed.inferredFandoms).toEqual([]);
        expect(parsed.inferredFandomsConfidence).toBeNull();
        expect(parsed.inferredBoothId).toBeNull();
        expect(parsed.inferredBoothIdConfidence).toBeNull();
    });
});

describe("normalizeInferredBoothId", () => {
    test("rejects invalid booth formats", () => {
        expect(normalizeInferredBoothId("A-12-3")).toBeNull();
        expect(normalizeInferredBoothId("booth A12")).toBeNull();
        expect(normalizeInferredBoothId("")).toBeNull();
    });
});
