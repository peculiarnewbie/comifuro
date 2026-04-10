import type { Stagehand } from "@browserbasehq/stagehand";
import type { Page } from "playwright";
import { ApiClient } from "./api-client";
import {
    crawlThreadContinuations,
    connectStagehand,
    ensureBrowserAvailable,
    extractVisibleTweets,
    findExistingPage,
    openLiveSearch,
    openTweetDetailPage,
    scrollTimeline,
} from "./browser";
import { loadConfig } from "./config";
import { uploadTweetImages } from "./images";
import { ensureOpencodeServer } from "./opencode-manager";
import { createClassifier } from "./opencode";
import type { ExtractedTweet } from "./types";

function compareTweetIds(left: string, right: string) {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    if (leftId === rightId) {
        return 0;
    }
    return leftId > rightId ? 1 : -1;
}

function buildImageMask(indices: number[]) {
    let mask = 0;

    for (const index of indices) {
        mask |= 1 << index;
    }

    return mask;
}

async function storeCatalogueTweet(params: {
    apiClient: ApiClient;
    tweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
    classificationReason: string;
    classifierPromptVersion: string;
    inferredFandoms: string[];
    inferredBoothId: string | null;
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
        continueOnImageError,
        skipUpsertWhenNoMedia,
    } = params;
    const media = await uploadTweetImages(apiClient, tweet, {
        continueOnError: continueOnImageError,
    });
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
        rootTweetId: tweet.rootTweetId,
        parentTweetId: tweet.parentTweetId,
        threadPosition: tweet.threadPosition,
        media,
    });

    return media.length > 0;
}

async function processSearchTweet(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    tweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
}) {
    const { apiClient, classifier, tweet, eventId, searchQuery } = params;
    const classification = await classifier.classify({
        tweetText: tweet.text,
        matchedTags: tweet.matchedTags,
        searchQuery,
    });

    if (!classification.isCatalogue) {
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
            inferredBoothId: null,
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
    });

    console.log(
        JSON.stringify({
            type: "root-processed",
            tweetId: tweet.id,
            accepted,
            discoverySource: tweet.discoverySource,
        }),
    );

    return {
        accepted,
        classifierPromptVersion: classifier.promptVersion,
        classificationReason: classification.reason,
    };
}

async function processThreadContinuations(params: {
    apiClient: ApiClient;
    page: Page;
    rootTweet: ExtractedTweet;
    eventId: string;
    searchQuery: string;
    classifierPromptVersion: string;
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
        const accepted = await storeCatalogueTweet({
            apiClient,
            tweet,
            eventId,
            searchQuery,
            classificationReason: `inherited from root ${rootTweet.id}`,
            classifierPromptVersion,
            inferredFandoms: [],
            inferredBoothId: null,
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

async function run(stagehand: Stagehand, config = loadConfig()) {
    const apiClient = new ApiClient(config.apiBaseUrl, config.apiPassword);
    const classifier = await createClassifier(config);
    const state = await apiClient.getState(config.stateId);
    const page = await findExistingPage(stagehand, config);

    console.log(`using page ${page.url() || "[blank]"}`);
    await openLiveSearch(page, config.searchQuery);

    let idleScrolls = 0;
    let stopAtKnownTweet = false;
    let latestSeenThisRun: string | null = null;
    let acceptedCount = 0;
    const seenTweetIds = new Set<string>();

    while (idleScrolls < config.idleScrollLimit && !stopAtKnownTweet) {
        const visibleTweets = await extractVisibleTweets(page);
        const newTweets = visibleTweets.filter((tweet) => {
            if (seenTweetIds.has(tweet.id)) {
                return false;
            }

            seenTweetIds.add(tweet.id);
            return true;
        });

        if (newTweets.length === 0) {
            idleScrolls += 1;
            await scrollTimeline(page, config.scrollDelayMs);
            continue;
        }

        idleScrolls = 0;

        for (const tweet of newTweets) {
            if (!latestSeenThisRun) {
                latestSeenThisRun = tweet.id;
            }

            if (
                state?.lastSeenTweetId &&
                compareTweetIds(tweet.id, state.lastSeenTweetId) <= 0
            ) {
                stopAtKnownTweet = true;
                break;
            }

            try {
                const result = await processSearchTweet({
                    apiClient,
                    classifier,
                    tweet,
                    eventId: config.eventId,
                    searchQuery: config.searchQuery,
                });

                if (result.accepted) {
                    acceptedCount += 1;

                    try {
                        const detailPage = await openTweetDetailPage(page, tweet.tweetUrl);
                        try {
                            const acceptedThreadIds = await processThreadContinuations({
                                apiClient,
                                page: detailPage,
                                rootTweet: tweet,
                                eventId: config.eventId,
                                searchQuery: config.searchQuery,
                                classifierPromptVersion:
                                    result.classifierPromptVersion,
                                scrollDelayMs: config.threadScrollDelayMs,
                                idleScrollLimit: config.threadIdleScrollLimit,
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
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            }),
                        );
                    }
                }
            } catch (error) {
                console.error(`failed ${tweet.id}`, error);
                await apiClient.upsertTweet({
                    id: tweet.id,
                    eventId: config.eventId,
                    user: tweet.user,
                    displayName: tweet.displayName,
                    timestamp: tweet.timestamp,
                    text: tweet.text,
                    tweetUrl: tweet.tweetUrl,
                    searchQuery: config.searchQuery,
                    matchedTags: tweet.matchedTags,
                    imageMask: 0,
                    classification: "error",
                    classificationReason:
                        error instanceof Error ? error.message : String(error),
                    classifierPromptVersion: classifier.promptVersion,
                    inferredFandoms: [],
                    inferredBoothId: null,
                    rootTweetId: null,
                    parentTweetId: null,
                    threadPosition: null,
                    media: [],
                });
            }
        }

        if (!stopAtKnownTweet) {
            await scrollTimeline(page, config.scrollDelayMs);
        }
    }

    if (latestSeenThisRun) {
        await apiClient.updateState(config.stateId, latestSeenThisRun);
    }

    if (acceptedCount > 0) {
        await apiClient.exportPublicFeed(config.eventId);
    }

    console.log(
        JSON.stringify({
            acceptedCount,
            lastSeenBeforeRun: state?.lastSeenTweetId ?? null,
            lastSeenAfterRun: latestSeenThisRun,
        }),
    );
}

let stagehand: Stagehand | null = null;
let stopManagedOpencode: (() => void) | null = null;
let cleanupRegistered = false;

function registerCleanup() {
    if (cleanupRegistered) {
        return;
    }

    cleanupRegistered = true;
    const cleanup = () => {
        stopManagedOpencode?.();
        stopManagedOpencode = null;
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
        cleanup();
        process.exit(130);
    });
    process.on("SIGTERM", () => {
        cleanup();
        process.exit(143);
    });
}

async function main() {
    const config = loadConfig();
    registerCleanup();

    try {
        const managedOpencode = await ensureOpencodeServer(config);
        stopManagedOpencode = managedOpencode.stop;
        await ensureBrowserAvailable(config);
        stagehand = await connectStagehand(config);
        await run(stagehand, config);
        process.exit(0);
    } finally {
        stopManagedOpencode?.();
        // Stagehand closes the connected browser on close(). When we attach to an
        // existing authenticated Chrome instance over CDP, leaving cleanup to the
        // process exit avoids killing the user's browser session.
    }
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
