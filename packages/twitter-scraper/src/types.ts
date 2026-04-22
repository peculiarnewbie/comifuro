export type ExtractedTweet = {
    id: string;
    user: string;
    displayName: string | null;
    text: string;
    tweetUrl: string;
    timestamp: string;
    matchedTags: string[];
    previewImageUrls: string[];
    hasQuotedTweet: boolean;
    rootTweetId: string | null;
    parentTweetId: string | null;
    threadPosition: number | null;
    discoverySource: "search" | "thread";
};

export type ClassificationResult = {
    isCatalogue: boolean;
    reason: string;
    inferredFandoms: string[];
    inferredBoothId: string | null;
    inferredBoothIdConfidence: string | null;
    raw: string;
};

export type UploadedMedia = {
    mediaIndex: number;
    r2Key: string;
    thumbnailR2Key?: string;
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

export type ScraperRunMode = "default" | "max-id";

export type ScraperConfig = {
    apiBaseUrl: string;
    apiPassword: string;
    eventId: string;
    stateId: string;
    searchQuery: string;
    browserCdpUrl: string;
    scraperBrowserCommand?: string;
    scraperPageUrlMatch: string;
    scrollDelayMs: number;
    idleScrollLimit: number;
    threadScrollDelayMs: number;
    threadIdleScrollLimit: number;
    opencodeBaseUrl: string;
    opencodeManaged: boolean;
    opencodeBin: string;
    opencodeProviderId?: string;
    opencodeModelId?: string;
    opencodeUsername?: string;
    opencodePassword?: string;
    classifierPromptPath: string;
    runMode: ScraperRunMode;
    searchMaxId: string | null;
    searchSinceDate: string | null;
    updateState: boolean;
    maxIdReloadPageLimit: number;
};
