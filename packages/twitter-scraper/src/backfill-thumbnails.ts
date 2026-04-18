import sharp from "sharp";
import { ApiClient } from "./api-client";

const API_BASE_URL =
    process.env.API_BASE_URL ?? "https://cf.peculiarnewbie.com/api";
const API_PASSWORD =
    process.env.API_PASSWORD ??
    process.env.PEC_PASSWORD ??
    process.env.PASSWORD;
const R2_PUBLIC_BASE_URL =
    process.env.R2_PUBLIC_BASE_URL ?? "https://r2.comifuro.peculiarnewbie.com";
const RATE_PER_SEC = Number(process.env.BACKFILL_RATE_PER_SEC ?? 5);
const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE ?? 100);

const WEBP_QUALITY = 85;
const WEBP_EFFORT = 6;
const THUMBNAIL_MAX_DIMENSION = 720;

if (!API_PASSWORD) {
    throw new Error("API_PASSWORD or PEC_PASSWORD is required");
}

const apiClient = new ApiClient(API_BASE_URL, API_PASSWORD);
const r2BaseUrl = R2_PUBLIC_BASE_URL.replace(/\/$/, "");
const delayMs = Math.round(1000 / RATE_PER_SEC);

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

let cursor: { tweetId: string; mediaIndex: number } | undefined;
let processed = 0;
let skipped = 0;
let failed = 0;

console.log(
    `starting thumbnail backfill: rate=${RATE_PER_SEC}/s page=${PAGE_SIZE}`,
);

for (;;) {
    const page = await apiClient.listMediaMissingThumbnails({
        limit: PAGE_SIZE,
        cursor,
    });

    if (page.items.length === 0) {
        break;
    }

    for (const item of page.items) {
        const sourceUrl = `${r2BaseUrl}/${item.r2Key}`;
        const thumbnailKey = `${item.tweetId}/${item.mediaIndex}.thumb.webp`;

        try {
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                console.warn(
                    `skipping ${item.r2Key}: r2 responded ${response.status}`,
                );
                if (response.status === 404) {
                    skipped += 1;
                } else {
                    failed += 1;
                }
            } else {
                const buffer = Buffer.from(await response.arrayBuffer());
                const thumbnail = await sharp(buffer)
                    .rotate()
                    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
                        fit: "inside",
                        withoutEnlargement: true,
                    })
                    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
                    .toBuffer();

                await apiClient.uploadImage(thumbnailKey, thumbnail);
                await apiClient.setMediaThumbnail({
                    tweetId: item.tweetId,
                    mediaIndex: item.mediaIndex,
                    thumbnailR2Key: thumbnailKey,
                });

                processed += 1;
                if (processed % 25 === 0) {
                    console.log(
                        `progress: processed=${processed} skipped=${skipped} failed=${failed}`,
                    );
                }
            }
        } catch (error) {
            console.warn(
                `failed ${item.r2Key}:`,
                error instanceof Error ? error.message : String(error),
            );
            failed += 1;
        }

        cursor = { tweetId: item.tweetId, mediaIndex: item.mediaIndex };
        await sleep(delayMs);
    }

    if (!page.nextCursor) {
        break;
    }
}

console.log(
    `done: processed=${processed} skipped=${skipped} failed=${failed}`,
);
