import { defaultRuntime, HttpError, type Runtime } from "./runtime";
import sharp from "sharp";
import { ApiClient } from "./api-client";
import type { ExtractedTweet, UploadedMedia } from "./types";

const IMAGE_NAME_FALLBACKS = ["orig", "4096x4096", "large"] as const;

function inferImageFormat(url: URL) {
    const explicit = url.searchParams.get("format");
    if (explicit) {
        return explicit;
    }

    const match = url.pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1] ?? "jpg";
}

function buildImageCandidates(previewUrl: string) {
    const url = new URL(previewUrl);
    url.searchParams.set("format", inferImageFormat(url));

    return IMAGE_NAME_FALLBACKS.map((name) => {
        const candidate = new URL(url);
        candidate.searchParams.set("name", name);
        return candidate.toString();
    });
}

export async function fetchBestImage(previewUrl: string, runtime: Runtime = defaultRuntime) {
    let lastError: Error | null = null;

    for (const candidate of buildImageCandidates(previewUrl)) {
        try {
            return await runtime.request(candidate, {}, async (response) => {
                const contentType = response.headers.get("content-type") ?? "image/jpeg";
                if (!contentType.startsWith("image/"))
                    throw new Error("Media response was not an image");
                const maxBytes = 25 * 1024 * 1024;
                if (Number(response.headers.get("content-length")) > maxBytes) {
                    await response.body?.cancel();
                    throw new Error("Image exceeds 25 MiB");
                }
                const reader = response.body?.getReader();
                if (!reader) throw new Error("Image response has no body");
                const chunks: Uint8Array[] = [];
                let bytes = 0;
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        bytes += value.byteLength;
                        if (bytes > maxBytes) throw new Error("Image exceeds 25 MiB");
                        chunks.push(value);
                    }
                } finally {
                    await reader.cancel();
                }
                return { sourceUrl: candidate, contentType, buffer: Buffer.concat(chunks) };
            });
        } catch (error) {
            if (!(error instanceof HttpError) || ![404, 400].includes(error.status)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError ?? new Error(`could not resolve image for ${previewUrl}`);
}

export type RawImage = {
    mediaIndex: number;
    buffer: Buffer;
    sourceUrl: string;
    contentType: string;
};

export async function fetchRawImages(
    tweet: ExtractedTweet,
    options?: { continueOnError?: boolean; runtime?: Runtime },
): Promise<RawImage[]> {
    const images: RawImage[] = [];
    const continueOnError = options?.continueOnError ?? false;

    for (const [mediaIndex, previewUrl] of tweet.previewImageUrls.entries()) {
        try {
            const image = await fetchBestImage(previewUrl, options?.runtime);
            images.push({
                mediaIndex,
                buffer: image.buffer,
                sourceUrl: image.sourceUrl,
                contentType: image.contentType,
            });
        } catch (error) {
            if (!continueOnError) {
                throw error;
            }

            console.warn(
                `skipping image ${tweet.id}/${mediaIndex}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    return images;
}

const MAX_IMAGE_PIXELS = 40_000_000;
const WEBP_QUALITY = 85;
const WEBP_EFFORT = 6;
const THUMBNAIL_MAX_DIMENSION = 720;

export async function uploadRawImages(
    apiClient: ApiClient,
    tweetId: string,
    images: RawImage[],
    options?: { continueOnError?: boolean },
): Promise<UploadedMedia[]> {
    const uploaded: UploadedMedia[] = [];
    const continueOnError = options?.continueOnError ?? false;

    for (const image of images) {
        try {
            const metadata = await sharp(image.buffer, {
                limitInputPixels: MAX_IMAGE_PIXELS,
            }).metadata();
            const webpBuffer = await sharp(image.buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
                .rotate()
                .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
                .toBuffer();
            const thumbnailBuffer = await sharp(image.buffer, {
                limitInputPixels: MAX_IMAGE_PIXELS,
            })
                .rotate()
                .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
                .toBuffer();
            const key = `${tweetId}/${image.mediaIndex}.webp`;
            const thumbnailKey = `${tweetId}/${image.mediaIndex}.thumb.webp`;

            await apiClient.uploadImage(key, webpBuffer);
            await apiClient.uploadImage(thumbnailKey, thumbnailBuffer);

            uploaded.push({
                mediaIndex: image.mediaIndex,
                r2Key: key,
                thumbnailR2Key: thumbnailKey,
                sourceUrl: image.sourceUrl,
                contentType: "image/webp",
                width: metadata.width,
                height: metadata.height,
            });
        } catch (error) {
            if (!continueOnError) {
                throw error;
            }

            console.warn(
                `skipping image upload ${tweetId}/${image.mediaIndex}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    return uploaded;
}

export async function uploadTweetImages(
    apiClient: ApiClient,
    tweet: ExtractedTweet,
    options?: {
        continueOnError?: boolean;
    },
) {
    const images = await fetchRawImages(tweet, options);
    return await uploadRawImages(apiClient, tweet.id, images, options);
}
