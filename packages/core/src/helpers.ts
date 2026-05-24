import { EventId } from "./schema";
import * as Schema from "effect/Schema";

export const TWEET_MEDIA_KEY_REGEX =
    /^[A-Za-z0-9_-]+\/\d+(?:\.thumb)?\.webp$/;

export function toDate(value: number | string | Date | null | undefined) {
    if (value == null) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "number") {
        return new Date(value);
    }

    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber) && `${parsedNumber}` === value) {
        return new Date(parsedNumber);
    }

    return new Date(value);
}

export function normalizeEventId(
    value: string | null | undefined,
    fallback: EventId = Schema.decodeUnknownSync(EventId)("cf21"),
): EventId {
    const trimmed = value?.trim().toLowerCase();
    return trimmed ? Schema.decodeUnknownSync(EventId)(trimmed) : fallback;
}

export function normalizeTagList(values: string[] | undefined) {
    if (values === undefined) {
        return undefined;
    }

    return Array.from(
        new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
}

export function toNumberParam(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export type FallbackImageRef = {
    r2Key: string;
    thumbnailR2Key: string | null;
};

export function getFallbackImageRefs(
    tweetId: string,
    mask: number,
    maxBits = 8,
): FallbackImageRef[] {
    const refs: FallbackImageRef[] = [];

    for (let index = 0; index < maxBits; index += 1) {
        if ((mask & (1 << index)) !== 0) {
            refs.push({
                r2Key: `${tweetId}/${index}.webp`,
                thumbnailR2Key: null,
            });
        }
    }

    return refs;
}
