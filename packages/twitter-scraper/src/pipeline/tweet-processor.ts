import * as Schema from "effect/Schema";
import { ExtractedTweetSchema } from "../types";
import type { TaskJournal } from "../run-store";
import { defaultRuntime, type Runtime } from "../runtime";
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

    const media = await uploadRawImages(apiClient, tweet.id, rawImages, {
        continueOnError: continueOnImageError,
    });
    if (media.length === 0 && !skipUpsertWhenNoMedia)
        throw new Error(`No images stored for catalogue ${tweet.id}`);

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
    runtime?: Runtime;
    journal?: TaskJournal;
}) {
    const { apiClient, classifier, tweet, eventId, searchQuery } = params;

    const rawImages = await fetchRawImages(tweet, { runtime: params.runtime });

    const classification = await classifier.classify({
        tweetText: tweet.text,
        matchedTags: tweet.matchedTags,
        searchQuery,
        images: rawImages,
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
    runtime?: Runtime;
    journal?: TaskJournal;
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

    const savedChain = params.journal?.read("thread-chain");
    const chain =
        savedChain !== undefined
            ? Schema.decodeUnknownSync(Schema.Array(ExtractedTweetSchema))(savedChain)
            : (
                  await crawlThreadContinuations({
                      page,
                      rootTweet,
                      scrollDelayMs,
                      idleScrollLimit,
                      runtime: params.runtime,
                  })
              ).chain;
    params.journal?.write("thread-chain", chain);

    const acceptedIds: string[] = [];
    for (const tweet of chain) {
        const doneKey = `continuation:${tweet.id}`;
        if (params.journal?.read(doneKey) === true) {
            acceptedIds.push(tweet.id);
            continue;
        }
        const rawImages = await fetchRawImages(tweet, { runtime: params.runtime });

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
        });

        if (accepted) {
            params.journal?.write(doneKey, true);
            acceptedIds.push(tweet.id);
        }
    }

    console.log(
        JSON.stringify({
            type: "thread-crawl-end",
            rootTweetId: rootTweet.id,
            discoveredCount: chain.length,
            acceptedCount: acceptedIds.length,
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
    runtime?: Runtime;
    journal?: TaskJournal;
}) {
    const runtime = params.runtime ?? defaultRuntime;
    runtime.signal.throwIfAborted();
    const savedRoot = params.journal?.read("root-result");
    const result =
        savedRoot !== undefined
            ? Schema.decodeUnknownSync(
                  Schema.Struct({
                      accepted: Schema.Boolean,
                      classifierPromptVersion: Schema.String,
                      inferredBoothId: Schema.NullOr(Schema.String),
                      inferredBoothIdConfidence: Schema.NullOr(Schema.String),
                  }),
              )(savedRoot)
            : await processSearchTweet(params);
    params.journal?.write("root-result", result);
    if (!result.accepted) return 0;

    await runtime.wait(params.threadScrollDelayMs);
    const detailPage =
        params.journal?.read("thread-chain") !== undefined
            ? params.page
            : await openTweetDetailPage(params.page, params.tweet.tweetUrl);
    try {
        const acceptedIds = await processThreadContinuations({
            apiClient: params.apiClient,
            page: detailPage,
            rootTweet: params.tweet,
            eventId: params.eventId,
            searchQuery: params.searchQuery,
            classifierPromptVersion: result.classifierPromptVersion,
            rootInferredBoothId: result.inferredBoothId,
            rootInferredBoothIdConfidence: result.inferredBoothIdConfidence,
            scrollDelayMs: params.threadScrollDelayMs,
            idleScrollLimit: params.threadIdleScrollLimit,
            runtime,
            journal: params.journal,
        });
        return 1 + acceptedIds.length;
    } finally {
        if (detailPage !== params.page) await detailPage.close().catch(() => {});
    }
}
