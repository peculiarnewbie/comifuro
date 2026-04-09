import { InferenceConfidenceValues } from "@comifuro/core/schema";
import type { InferenceConfidence } from "@comifuro/core/types";
import { z } from "zod";
import type { ClassificationResult } from "./types";

const classificationSchema = z.object({
    isCatalogue: z.boolean(),
    confidence: z.enum(InferenceConfidenceValues),
    reason: z.string(),
    inferredFandoms: z.array(z.string()).optional().nullable(),
    inferredFandomsConfidence: z
        .enum(InferenceConfidenceValues)
        .optional()
        .nullable(),
    inferredBoothId: z.string().optional().nullable(),
    inferredBoothIdConfidence: z
        .enum(InferenceConfidenceValues)
        .optional()
        .nullable(),
});

const boothIdPattern = /^[A-Z]{1,3}-?\d{1,3}[A-Z]?$/;

function extractJsonObject(raw: string) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error(`opencode did not return JSON: ${raw}`);
    }

    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function normalizeConfidence(
    value: InferenceConfidence | null | undefined,
): InferenceConfidence | null {
    return value ?? null;
}

export function normalizeInferredFandoms(value: string[] | null | undefined) {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const candidate of value ?? []) {
        const trimmed = candidate.trim();
        if (!trimmed) {
            continue;
        }

        const dedupeKey = trimmed.toLowerCase();
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        normalized.push(trimmed);

        if (normalized.length >= 5) {
            break;
        }
    }

    return normalized;
}

export function normalizeInferredBoothId(value: string | null | undefined) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toUpperCase();
    if (!normalized) {
        return null;
    }

    return boothIdPattern.test(normalized) ? normalized : null;
}

export function parseClassificationResponse(
    raw: string,
): Omit<ClassificationResult, "raw"> {
    const parsed = classificationSchema.parse(extractJsonObject(raw));
    const inferredFandoms = normalizeInferredFandoms(parsed.inferredFandoms);
    const inferredBoothId = normalizeInferredBoothId(parsed.inferredBoothId);

    return {
        isCatalogue: parsed.isCatalogue,
        confidence: parsed.confidence,
        reason: parsed.reason.trim(),
        inferredFandoms,
        inferredFandomsConfidence:
            inferredFandoms.length > 0
                ? normalizeConfidence(parsed.inferredFandomsConfidence)
                : null,
        inferredBoothId,
        inferredBoothIdConfidence: inferredBoothId
            ? normalizeConfidence(parsed.inferredBoothIdConfidence)
            : null,
    };
}
