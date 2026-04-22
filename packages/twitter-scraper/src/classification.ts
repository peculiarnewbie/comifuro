import { z } from "zod";
import type { ClassificationResult } from "./types";

const requiredClassificationSchema = z.object({
    isCatalogue: z.boolean(),
    reason: z.string(),
});

const boothIdPattern = /^[A-Z]{1,3}-?\d{1,3}[A-Z]?$/;

// Loose pattern for finding candidate booth codes inside free-form text.
// Looks for things like "booth E-31a", "at A12", "B-58b", etc.
const looseBoothPattern = /\b([A-Z]{1,3})[-\s]?(\d{1,3})([A-Z]?)\b/gi;

export function extractBoothIdsFromText(text: string): string[] {
    const matches: string[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = looseBoothPattern.exec(text)) !== null) {
        const section = match[1]!.toUpperCase();
        const number = match[2]!;
        const suffix = match[3]!.toUpperCase();
        const normalized = `${section}-${number}${suffix}`;

        if (boothIdPattern.test(normalized) && !seen.has(normalized)) {
            seen.add(normalized);
            matches.push(normalized);
        }
    }

    return matches;
}

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

function asObjectRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value ? (value as Record<string, unknown>) : null;
}

export function normalizeInferredFandoms(value: unknown) {
    const candidates = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : [];
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
        if (typeof candidate !== "string") {
            continue;
        }

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

export function normalizeInferredBoothId(value: unknown) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") {
        return null;
    }

    const normalized = trimmed.toUpperCase();
    if (!normalized) {
        return null;
    }

    return boothIdPattern.test(normalized) ? normalized : null;
}

export function parseClassificationResponse(
    raw: string,
): Omit<ClassificationResult, "raw"> {
    const parsed = extractJsonObject(raw);
    const parsedRecord = asObjectRecord(parsed);
    const required = requiredClassificationSchema.parse(parsed);
    const inferredFandoms = normalizeInferredFandoms(parsedRecord?.inferredFandoms);
    const inferredBoothId = normalizeInferredBoothId(parsedRecord?.inferredBoothId);

    return {
        isCatalogue: required.isCatalogue,
        reason: required.reason.trim(),
        inferredFandoms,
        inferredBoothId,
        inferredBoothIdConfidence: null as string | null,
    };
}
