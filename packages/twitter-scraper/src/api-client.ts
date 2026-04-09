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
    media: UploadedMedia[];
};

export class ApiClient {
    constructor(
        private readonly apiBaseUrl: string,
        private readonly apiPassword: string,
    ) {}

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(new URL(path, this.apiBaseUrl), {
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
}
