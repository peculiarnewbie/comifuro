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

async function fetchBestImage(previewUrl: string) {
    let lastError: Error | null = null;

    for (const candidate of buildImageCandidates(previewUrl)) {
        try {
            const response = await fetch(candidate, {
                headers: {
                    "user-agent":
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                },
            });

            if (!response.ok) {
                lastError = new Error(`failed to fetch ${candidate}: ${response.status}`);
                continue;
            }

            return {
                sourceUrl: candidate,
                contentType: response.headers.get("content-type") ?? "image/jpeg",
                buffer: Buffer.from(await response.arrayBuffer()),
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError ?? new Error(`could not resolve image for ${previewUrl}`);
}

export async function uploadTweetImages(
    apiClient: ApiClient,
    tweet: ExtractedTweet,
) {
    const uploaded: UploadedMedia[] = [];

    for (const [mediaIndex, previewUrl] of tweet.previewImageUrls.entries()) {
        const image = await fetchBestImage(previewUrl);
        const metadata = await sharp(image.buffer).metadata();
        const webpBuffer = await sharp(image.buffer)
            .rotate()
            .webp({ quality: 92 })
            .toBuffer();
        const key = `${tweet.id}/${mediaIndex}.webp`;

        await apiClient.uploadImage(key, webpBuffer);

        uploaded.push({
            mediaIndex,
            r2Key: key,
            sourceUrl: image.sourceUrl,
            contentType: "image/webp",
            width: metadata.width,
            height: metadata.height,
        });
    }

    return uploaded;
}
