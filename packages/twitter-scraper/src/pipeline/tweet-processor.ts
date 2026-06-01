import type { Page } from "playwright";
import { ApiClient } from "../api-client";
import { crawlThreadContinuations, openTweetDetailPage } from "../browser";
import { fetchRawImages, uploadRawImages } from "../images";
import type { RawImage } from "../images";
import { createClassifier } from "../opencode";
import type { ExtractedTweet } from "../types";

function buildImageMask(indices: number[]) {
    let mask = 0;
    for (const index of indices) {
        mask |= 1 << index;
    }
    return mask;
}

export async function storeCatalogueTweet(params: {
    apiClient: ApiClient;
    tweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
    classificationReason: string;
    classifierPromptVersion: string;
    inferredFandoms: string[];
    inferredBoothId: string | null;
    inferredBoothIdConfidence: string | null;
    inferredItemTypes: string[];
    preorderDeadline: string | null;
    items: { type: string; price?: string | null; fandom?: string | null }[];
    rawImages: RawImage[];
    continueOnImageError?: boolean;
    skipUpsertWhenNoMedia?: boolean;
}) {
    const {
        apiClient,
        tweet,
        eventId,
        searchQuery,
        classificationReason,
        classifierPromptVersion,
        inferredFandoms,
        inferredBoothId,
        inferredBoothIdConfidence,
        inferredItemTypes,
        preorderDeadline,
        items,
        rawImages,
        continueOnImageError,
        skipUpsertWhenNoMedia,
    } = params;

    let media: import("../types").UploadedMedia[] = [];
    try {
        media = await uploadRawImages(apiClient, tweet.id, rawImages, {
            continueOnError: continueOnImageError,
        });
    } catch {
        media = [];
    }

    const imageMask = buildImageMask(media.map((item) => item.mediaIndex));

    if (media.length === 0 && skipUpsertWhenNoMedia) {
        return false;
    }

    await apiClient.upsertTweet({
        id: tweet.id,
        eventId,
        user: tweet.user,
        displayName: tweet.displayName,
        timestamp: tweet.timestamp,
        text: tweet.text,
        tweetUrl: tweet.tweetUrl,
        searchQuery,
        matchedTags: tweet.matchedTags,
        imageMask,
        classification: media.length > 0 ? "catalogue" : "error",
        classificationReason:
            media.length > 0
                ? classificationReason
                : "classified as catalogue but no downloadable images were found",
        classifierPromptVersion,
        inferredFandoms,
        inferredBoothId,
        inferredBoothIdConfidence,
        inferredItemTypes,
        preorderDeadline,
        items,
        rootTweetId: tweet.rootTweetId,
        parentTweetId: tweet.parentTweetId,
        threadPosition: tweet.threadPosition,
        media,
    });

    return media.length > 0;
}

export async function processSearchTweet(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    tweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
}) {
    const { apiClient, classifier, tweet, eventId, searchQuery } = params;

    const rawImages = await fetchRawImages(tweet, { continueOnError: true });

    const classification = await classifier.classify({
        tweetText: tweet.text,
        matchedTags: tweet.matchedTags,
        searchQuery,
        imageUrls: rawImages.map((img) => img.sourceUrl),
    });

    if (classification.classification === "not_catalogue") {
        await apiClient.upsertTweet({
            id: tweet.id,
            eventId,
            user: tweet.user,
            displayName: tweet.displayName,
            timestamp: tweet.timestamp,
            text: tweet.text,
            tweetUrl: tweet.tweetUrl,
            searchQuery,
            matchedTags: tweet.matchedTags,
            imageMask: 0,
            classification: "not_catalogue",
            classificationReason: classification.reason,
            classifierPromptVersion: classifier.promptVersion,
            inferredFandoms: [],
            inferredBoothId: classification.inferredBoothId,
            inferredBoothIdConfidence: classification.inferredBoothIdConfidence,
            inferredItemTypes: [],
            preorderDeadline: null,
            items: [],
            rootTweetId: null,
            parentTweetId: null,
            threadPosition: null,
            media: [],
        });
        console.log(`skip ${tweet.id}: ${classification.reason}`);
        return {
            accepted: false,
            classifierPromptVersion: classifier.promptVersion,
            classificationReason: classification.reason,
            inferredBoothId: classification.inferredBoothId,
            inferredBoothIdConfidence: classification.inferredBoothIdConfidence,
            items: [],
            preorderDeadline: null,
        };
    }

    const accepted = await storeCatalogueTweet({
        apiClient,
        tweet,
        eventId,
        searchQuery,
        classificationReason: classification.reason,
        classifierPromptVersion: classifier.promptVersion,
        inferredFandoms: classification.inferredFandoms,
        inferredBoothId: classification.inferredBoothId,
        inferredBoothIdConfidence: classification.inferredBoothIdConfidence,
        inferredItemTypes: classification.inferredItemTypes,
        preorderDeadline: classification.preorderDeadline,
        items: classification.items,
        rawImages,
    });

    console.log(
        JSON.stringify({
            type: "root-processed",
            tweetId: tweet.id,
            accepted,
            discoverySource: tweet.discoverySource,
            inferredItemTypes: classification.inferredItemTypes,
            itemCount: classification.items.length,
        }),
    );

    return {
        accepted,
        classifierPromptVersion: classifier.promptVersion,
        classificationReason: classification.reason,
        inferredBoothId: classification.inferredBoothId,
        inferredBoothIdConfidence: classification.inferredBoothIdConfidence,
        items: classification.items,
        preorderDeadline: classification.preorderDeadline,
    };
}

export async function processThreadContinuations(params: {
    apiClient: ApiClient;
    page: Page;
    rootTweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
    classifierPromptVersion: string;
    rootInferredBoothId: string | null;
    rootInferredBoothIdConfidence: string | null;
    scrollDelayMs: number;
    idleScrollLimit: number;
}) {
    const {
        apiClient,
        page,
        rootTweet,
        eventId,
        searchQuery,
        classifierPromptVersion,
        rootInferredBoothId,
        rootInferredBoothIdConfidence,
        scrollDelayMs,
        idleScrollLimit,
    } = params;

    console.log(
        JSON.stringify({
            type: "thread-crawl-start",
            rootTweetId: rootTweet.id,
            tweetUrl: rootTweet.tweetUrl,
        }),
    );

    const crawlResult = await crawlThreadContinuations({
        page,
        rootTweet,
        scrollDelayMs,
        idleScrollLimit,
    });

    const acceptedIds: string[] = [];
    for (const tweet of crawlResult.chain) {
        const rawImages = await fetchRawImages(tweet, { continueOnError: true });

        const accepted = await storeCatalogueTweet({
            apiClient,
            tweet,
            eventId,
            searchQuery,
            classificationReason: `inherited from root ${rootTweet.id}`,
            classifierPromptVersion,
            inferredFandoms: [],
            inferredBoothId: rootInferredBoothId,
            inferredBoothIdConfidence: rootInferredBoothIdConfidence,
            inferredItemTypes: [],
            preorderDeadline: null,
            items: [],
            rawImages,
            continueOnImageError: true,
            skipUpsertWhenNoMedia: true,
        });

        if (accepted) {
            acceptedIds.push(tweet.id);
        }
    }

    console.log(
        JSON.stringify({
            type: "thread-crawl-end",
            rootTweetId: rootTweet.id,
            discoveredCount: crawlResult.chain.length,
            acceptedCount: acceptedIds.length,
            skipped: crawlResult.skipped,
        }),
    );

    return acceptedIds;
}

export async function processDiscoveredTweet(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    tweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
    threadScrollDelayMs: number;
    threadIdleScrollLimit: number;
    seenTweetIds: Set<string>;
}) {
    const {
        apiClient,
        classifier,
        page,
        tweet,
        eventId,
        searchQuery,
        threadScrollDelayMs,
        threadIdleScrollLimit,
        seenTweetIds,
    } = params;

    try {
        const result = await processSearchTweet({
            apiClient,
            classifier,
            tweet,
            eventId,
            searchQuery,
        });

        if (!result.accepted) {
            return 0;
        }

        let acceptedCount = 1;

        try {
            const detailPage = await openTweetDetailPage(page, tweet.tweetUrl);
            try {
                const acceptedThreadIds = await processThreadContinuations({
                    apiClient,
                    page: detailPage,
                    rootTweet: tweet,
                    eventId,
                    searchQuery,
                    classifierPromptVersion: result.classifierPromptVersion,
                    rootInferredBoothId: result.inferredBoothId,
                    rootInferredBoothIdConfidence: result.inferredBoothIdConfidence,
                    scrollDelayMs: threadScrollDelayMs,
                    idleScrollLimit: threadIdleScrollLimit,
                });

                for (const tweetId of acceptedThreadIds) {
                    seenTweetIds.add(tweetId);
                }

                acceptedCount += acceptedThreadIds.length;
            } finally {
                await detailPage.close();
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    type: "thread-crawl-failed",
                    rootTweetId: tweet.id,
                    tweetUrl: tweet.tweetUrl,
                    error: error instanceof Error ? error.message : String(error),
                }),
            );
        }

        return acceptedCount;
    } catch (error) {
        console.error(`failed ${tweet.id}`, error);
        try {
            await apiClient.upsertTweet({
                id: tweet.id,
                eventId,
                user: tweet.user,
                displayName: tweet.displayName,
                timestamp: tweet.timestamp,
                text: tweet.text,
                tweetUrl: tweet.tweetUrl,
                searchQuery,
                matchedTags: tweet.matchedTags,
                imageMask: 0,
                classification: "error",
                classificationReason: error instanceof Error ? error.message : String(error),
                classifierPromptVersion: classifier.promptVersion,
                inferredFandoms: [],
                inferredBoothId: null,
                inferredBoothIdConfidence: null,
                inferredItemTypes: [],
                preorderDeadline: null,
                items: [],
                rootTweetId: null,
                parentTweetId: null,
                threadPosition: null,
                media: [],
            });
        } catch (upsertError) {
            console.error(`failed to persist scraper error for ${tweet.id}`, upsertError);
        }

        return 0;
    }
}
