import * as Schema from "effect/Schema";
import type { ClassificationResult, ItemInfo } from "./types";

const requiredClassificationSchema = Schema.Struct({
    isCatalogue: Schema.Boolean,
    reason: Schema.String,
});

const itemSchema = Schema.Struct({
    type: Schema.String,
    price: Schema.optional(Schema.NullOr(Schema.String)),
    fandom: Schema.optional(Schema.NullOr(Schema.String)),
});

const boothIdPattern = /^[A-Z]{1,3}-?\d{1,3}[A-Z]?$/;

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
    const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
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

export function normalizeInferredItemTypes(value: unknown) {
    const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
        if (typeof candidate !== "string") {
            continue;
        }

        const trimmed = candidate.trim().toLowerCase();
        if (!trimmed) {
            continue;
        }

        if (seen.has(trimmed)) {
            continue;
        }

        seen.add(trimmed);
        normalized.push(trimmed);

        if (normalized.length >= 8) {
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

export function normalizeItems(value: unknown): ItemInfo[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const result: ItemInfo[] = [];
    const seen = new Set<string>();

    for (const candidate of value) {
        let item: Schema.Schema.Type<typeof itemSchema>;
        try {
            item = Schema.decodeUnknownSync(itemSchema)(candidate);
        } catch {
            continue;
        }

        const dedupeKey = `${item.type}:${item.fandom ?? ""}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        result.push({
            type: item.type.trim().toLowerCase(),
            price: item.price || null,
            fandom: item.fandom?.trim() || null,
        });

        if (result.length >= 20) {
            break;
        }
    }

    return result;
}

export function parseClassificationResponse(raw: string): Omit<ClassificationResult, "raw"> {
    const parsed = extractJsonObject(raw);
    const parsedRecord = asObjectRecord(parsed);
    const required = Schema.decodeUnknownSync(requiredClassificationSchema)(parsed);
    const inferredFandoms = normalizeInferredFandoms(parsedRecord?.inferredFandoms);
    const inferredBoothId = normalizeInferredBoothId(parsedRecord?.inferredBoothId);
    const inferredItemTypes = normalizeInferredItemTypes(parsedRecord?.inferredItemTypes);
    const preorderDeadline =
        typeof parsedRecord?.preorderDeadline === "string" &&
        parsedRecord.preorderDeadline.trim().toLowerCase() !== "null"
            ? parsedRecord.preorderDeadline.trim()
            : null;
    const items = normalizeItems(parsedRecord?.items);

    return {
        isCatalogue: required.isCatalogue,
        reason: required.reason.trim(),
        inferredFandoms,
        inferredBoothId,
        inferredBoothIdConfidence: null as string | null,
        inferredItemTypes,
        preorderDeadline,
        items,
    };
}
