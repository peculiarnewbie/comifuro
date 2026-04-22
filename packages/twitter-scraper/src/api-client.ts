import type { ScraperState, UploadedMedia } from "./types";

type ScrapedTweetPayload = {
    id: string;
    eventId: string;
    user: string;
    displayName: string | null;
    timestamp: string;
    text: string;
    tweetUrl: string;
    searchQuery: string;
    matchedTags: string[];
    imageMask: number;
    classification: "catalogue" | "not_catalogue" | "error";
    classificationReason: string;
    classifierPromptVersion: string;
    inferredFandoms: string[];
    inferredBoothId: string | null;
    inferredBoothIdConfidence: string | null;
    rootTweetId?: string | null;
    parentTweetId?: string | null;
    threadPosition?: number | null;
    media: UploadedMedia[];
};

export class ApiClient {
    constructor(
        private readonly apiBaseUrl: string,
        private readonly apiPassword: string,
    ) {}

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        const baseUrl = this.apiBaseUrl.endsWith("/")
            ? this.apiBaseUrl
            : `${this.apiBaseUrl}/`;
        const normalizedPath = path.replace(/^\/+/, "");
        const response = await fetch(new URL(normalizedPath, baseUrl), {
            ...init,
            headers: {
                ...(init?.headers ?? {}),
                "pec-password": this.apiPassword,
            },
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`${response.status} ${response.statusText}: ${message}`);
        }

        return (await response.json()) as T;
    }

    async getState(id: string) {
        return await this.request<ScraperState | null>(`/scraper/state/${id}`);
    }

    async updateState(id: string, lastSeenTweetId: string | null) {
        return await this.request<ScraperState>(`/scraper/state/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                lastSeenTweetId,
                lastRunAt: new Date().toISOString(),
            }),
        });
    }

    async uploadImage(key: string, buffer: Buffer, contentType = "image/webp") {
        const formData = new FormData();
        formData.append(
            "image",
            new File([new Uint8Array(buffer)], "tweet.webp", {
                type: contentType,
            }),
        );

        return await this.request<{ ok: true; key: string }>(
            `/upload/${encodeURIComponent(key)}`,
            {
                method: "POST",
                body: formData,
            },
        );
    }

    async upsertTweet(payload: ScrapedTweetPayload) {
        return await this.request<{ ok: true; id: string }>("/scraper/tweets/upsert", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    }

    async exportPublicFeed(eventId: string) {
        return await this.request<{ ok: true; bytes: number }>(
            "/scraper/export-public-feed",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ eventId }),
            },
        );
    }

    async listMediaMissingThumbnails(params?: {
        limit?: number;
        cursor?: { tweetId: string; mediaIndex: number };
    }) {
        const searchParams = new URLSearchParams();
        if (params?.limit) {
            searchParams.set("limit", String(params.limit));
        }
        if (params?.cursor) {
            searchParams.set("cursorTweetId", params.cursor.tweetId);
            searchParams.set(
                "cursorMediaIndex",
                String(params.cursor.mediaIndex),
            );
        }
        const query = searchParams.toString();
        return await this.request<{
            items: {
                tweetId: string;
                mediaIndex: number;
                r2Key: string;
            }[];
            nextCursor: { tweetId: string; mediaIndex: number } | null;
        }>(
            `/admin/media/missing-thumbnails${query ? `?${query}` : ""}`,
        );
    }

    async setMediaThumbnail(input: {
        tweetId: string;
        mediaIndex: number;
        thumbnailR2Key: string;
    }) {
        return await this.request<{ ok: true }>(
            `/admin/media/${encodeURIComponent(input.tweetId)}/${input.mediaIndex}/thumbnail`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    thumbnailR2Key: input.thumbnailR2Key,
                }),
            },
        );
    }
}
