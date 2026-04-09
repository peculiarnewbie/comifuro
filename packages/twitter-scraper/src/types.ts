import type { InferenceConfidence } from "@comifuro/core/types";

export type ExtractedTweet = {
    id: string;
    user: string;
    displayName: string | null;
    text: string;
    tweetUrl: string;
    timestamp: string;
    matchedTags: string[];
    previewImageUrls: string[];
};

export type ClassificationResult = {
    isCatalogue: boolean;
    confidence: InferenceConfidence;
    reason: string;
    inferredFandoms: string[];
    inferredFandomsConfidence: InferenceConfidence | null;
    inferredBoothId: string | null;
    inferredBoothIdConfidence: InferenceConfidence | null;
    raw: string;
};

export type UploadedMedia = {
    mediaIndex: number;
    r2Key: string;
    sourceUrl: string;
    contentType: string;
    width?: number;
    height?: number;
};

export type ScraperState = {
    id: string;
    lastSeenTweetId: string | null;
    lastRunAt: string | null;
    updatedAt: string;
};

export type ScraperConfig = {
    apiBaseUrl: string;
    apiPassword: string;
    eventId: string;
    stateId: string;
    searchQuery: string;
    stagehandCdpUrl: string;
    scraperBrowserCommand?: string;
    scraperPageUrlMatch: string;
    scrollDelayMs: number;
    idleScrollLimit: number;
    opencodeBaseUrl: string;
    opencodeManaged: boolean;
    opencodeBin: string;
    opencodeProviderId?: string;
    opencodeModelId?: string;
    opencodeUsername?: string;
    opencodePassword?: string;
    classifierPromptPath: string;
};
