import type { TweetId } from "@comifuro/core";

import * as Schema from "effect/Schema";

export const ExtractedTweetSchema = Schema.Struct({
    id: Schema.String,
    user: Schema.String,
    displayName: Schema.NullOr(Schema.String),
    text: Schema.String,
    tweetUrl: Schema.String,
    timestamp: Schema.String,
    matchedTags: Schema.mutable(Schema.Array(Schema.String)),
    previewImageUrls: Schema.mutable(Schema.Array(Schema.String)),
    hasQuotedTweet: Schema.Boolean,
    rootTweetId: Schema.NullOr(Schema.String),
    parentTweetId: Schema.NullOr(Schema.String),
    threadPosition: Schema.NullOr(Schema.Number),
    discoverySource: Schema.Literals(["search", "thread"]),
});
export type ExtractedTweet = Schema.Schema.Type<typeof ExtractedTweetSchema>;

export type ItemInfo = {
    type: string;
    price?: string | null;
    fandom?: string | null;
};

export type ClassificationResult =
    | {
          classification: "catalogue";
          reason: string;
          inferredFandoms: string[];
          inferredBoothId: string | null;
          inferredBoothIdConfidence: string | null;
          inferredItemTypes: string[];
          preorderDeadline: string | null;
          items: ItemInfo[];
          raw: string;
      }
    | {
          classification: "not_catalogue";
          reason: string;
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
    checkpoint: TweetId | null;
    startTweetId: TweetId | null;
    endTweetId: TweetId | null;
    lastSeenTweetId: TweetId | null;
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
    runDbPath: string;
    maxScrollsPerPage: number;
    pageDelayMs: number;
};
