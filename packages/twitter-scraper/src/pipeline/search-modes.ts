import type { Page } from "playwright";
import type { ApiClient } from "../api-client";
import { buildSearchQuery } from "../cli";
import type { loadConfig } from "../config";
import { extractVisibleTweets, openLiveSearch, scrollTimeline } from "../browser";
import type { createClassifier } from "../opencode";
import type { ExtractedTweet } from "../types";
import { processDiscoveredTweet } from "./tweet-processor";

function compareTweetIds(left: string, right: string) {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    if (leftId === rightId) {
        return 0;
    }
    return leftId > rightId ? 1 : -1;
}

function selectOlderTweetId(left: string | null, right: string) {
    if (!left) {
        return right;
    }
    return compareTweetIds(left, right) <= 0 ? left : right;
}

function isTweetBeforeSinceDate(tweet: ExtractedTweet, sinceDate: string | null) {
    if (!sinceDate) {
        return false;
    }
    return Date.parse(tweet.timestamp) < Date.parse(`${sinceDate}T00:00:00.000Z`);
}

async function resumeFromCheckpoint(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    config: ReturnType<typeof loadConfig>;
    persistedSearchQuery: string;
    previousEnd: string;
    checkpoint: string;
}): Promise<{
    acceptedCount: number;
    latestSeenThisRun: string | null;
    startTweetId: string | null;
}> {
    const { apiClient, classifier, page, config, persistedSearchQuery, previousEnd, checkpoint } =
        params;

    const searchQuery = buildSearchQuery(persistedSearchQuery, {
        maxId: previousEnd,
    });

    await openLiveSearch(page, searchQuery);

    let latestSeenThisRun: string | null = null;
    let startTweetId: string | null = null;
    let acceptedCount = 0;
    const seenTweetIds = new Set<string>();

    let idleScrolls = 0;
    let stopAtCheckpoint = true;

    while (idleScrolls < config.idleScrollLimit && stopAtCheckpoint) {
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
            if (!startTweetId) {
                startTweetId = tweet.id;
            }

            if (compareTweetIds(tweet.id, checkpoint) < 0) {
                stopAtCheckpoint = false;
                break;
            }

            if (isTweetBeforeSinceDate(tweet, config.searchSinceDate)) {
                stopAtCheckpoint = false;
                break;
            }

            acceptedCount += await processDiscoveredTweet({
                apiClient,
                classifier,
                page,
                tweet,
                eventId: config.eventId,
                searchQuery: persistedSearchQuery,
                threadScrollDelayMs: config.threadScrollDelayMs,
                threadIdleScrollLimit: config.threadIdleScrollLimit,
                seenTweetIds,
            });

            if (config.updateState && latestSeenThisRun) {
                await apiClient.updateState(config.stateId, {
                    checkpoint: checkpoint,
                    startTweetId: startTweetId,
                    endTweetId: latestSeenThisRun,
                    lastRunAt: new Date().toISOString(),
                    lastSeenTweetId: latestSeenThisRun,
                });
            }
        }

        if (stopAtCheckpoint) {
            await scrollTimeline(page, config.scrollDelayMs);
        }
    }

    return { acceptedCount, latestSeenThisRun, startTweetId };
}

async function runFromCheckpoint(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    config: ReturnType<typeof loadConfig>;
    persistedSearchQuery: string;
    checkpoint: string;
}): Promise<{
    acceptedCount: number;
    latestSeenThisRun: string | null;
    startTweetId: string | null;
}> {
    const { apiClient, classifier, page, config, persistedSearchQuery, checkpoint } = params;

    const searchQuery = buildSearchQuery(persistedSearchQuery);

    await openLiveSearch(page, searchQuery);

    let latestSeenThisRun: string | null = null;
    let startTweetId: string | null = null;
    let acceptedCount = 0;
    const seenTweetIds = new Set<string>();

    let idleScrolls = 0;
    let stopAtCheckpoint = true;

    while (idleScrolls < config.idleScrollLimit && stopAtCheckpoint) {
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
            if (!startTweetId) {
                startTweetId = tweet.id;
            }

            if (compareTweetIds(tweet.id, checkpoint) <= 0) {
                stopAtCheckpoint = false;
                break;
            }

            if (isTweetBeforeSinceDate(tweet, config.searchSinceDate)) {
                stopAtCheckpoint = false;
                break;
            }

            acceptedCount += await processDiscoveredTweet({
                apiClient,
                classifier,
                page,
                tweet,
                eventId: config.eventId,
                searchQuery: persistedSearchQuery,
                threadScrollDelayMs: config.threadScrollDelayMs,
                threadIdleScrollLimit: config.threadIdleScrollLimit,
                seenTweetIds,
            });

            if (config.updateState && latestSeenThisRun) {
                await apiClient.updateState(config.stateId, {
                    checkpoint: checkpoint,
                    startTweetId: startTweetId,
                    endTweetId: latestSeenThisRun,
                    lastRunAt: new Date().toISOString(),
                    lastSeenTweetId: latestSeenThisRun,
                });
            }
        }

        if (stopAtCheckpoint) {
            await scrollTimeline(page, config.scrollDelayMs);
        }
    }

    return { acceptedCount, latestSeenThisRun, startTweetId };
}

export async function runDefaultSearch(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    config: ReturnType<typeof loadConfig>;
    persistedSearchQuery: string;
}) {
    const { apiClient, classifier, page, config, persistedSearchQuery } = params;
    const state = await apiClient.getState(config.stateId);

    const checkpoint = state?.checkpoint;
    const previousEnd = state?.endTweetId;
    let totalAccepted = 0;
    let latestSeenOverall: string | null = null;

    if (previousEnd && checkpoint && compareTweetIds(previousEnd, checkpoint) > 0) {
        const result = await resumeFromCheckpoint({
            apiClient,
            classifier,
            page,
            config,
            persistedSearchQuery,
            previousEnd,
            checkpoint,
        });

        totalAccepted += result.acceptedCount;

        const newCheckpoint = state?.startTweetId || result.latestSeenThisRun || checkpoint;
        if (config.updateState && newCheckpoint) {
            await apiClient.updateState(config.stateId, {
                checkpoint: newCheckpoint,
                startTweetId: newCheckpoint,
                endTweetId: newCheckpoint,
                lastRunAt: new Date().toISOString(),
                lastSeenTweetId: newCheckpoint,
            });
        }
    }

    const effectiveCheckpoint =
        previousEnd && checkpoint ? state?.startTweetId || checkpoint : checkpoint;
    if (effectiveCheckpoint) {
        const result = await runFromCheckpoint({
            apiClient,
            classifier,
            page,
            config,
            persistedSearchQuery,
            checkpoint: effectiveCheckpoint,
        });

        totalAccepted += result.acceptedCount;
        if (result.latestSeenThisRun) {
            latestSeenOverall = result.latestSeenThisRun;
        }
    }

    if (config.updateState && latestSeenOverall) {
        await apiClient.updateState(config.stateId, {
            checkpoint: latestSeenOverall,
            startTweetId: latestSeenOverall,
            endTweetId: latestSeenOverall,
            lastRunAt: new Date().toISOString(),
            lastSeenTweetId: latestSeenOverall,
        });
    }

    if (totalAccepted > 0) {
        await apiClient.exportPublicFeed(config.eventId);
    }

    console.log(
        JSON.stringify({
            mode: config.runMode,
            acceptedCount: totalAccepted,
            checkpoint,
            previousEnd,
            latestSeenOverall,
            sinceDate: config.searchSinceDate,
        }),
    );
}

export async function runMaxIdSearch(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    config: ReturnType<typeof loadConfig>;
    persistedSearchQuery: string;
}) {
    const { apiClient, classifier, page, config, persistedSearchQuery } = params;
    let cursor = config.searchMaxId;
    let latestSeenThisRun: string | null = null;
    let acceptedCount = 0;
    let pageCount = 0;
    let stopReason: string | null = null;
    const seenTweetIds = new Set<string>();
    const visitedCursors = new Set<string>();

    while (pageCount < config.maxIdReloadPageLimit) {
        const activeQuery = buildSearchQuery(persistedSearchQuery, {
            maxId: cursor,
        });
        await openLiveSearch(page, activeQuery);
        pageCount += 1;

        let idleScrolls = 0;
        let oldestTweetIdOnPage: string | null = null;
        const pageSeenTweetIds = new Set<string>();

        while (idleScrolls < config.idleScrollLimit) {
            const visibleTweets = await extractVisibleTweets(page);

            for (const tweet of visibleTweets) {
                oldestTweetIdOnPage = selectOlderTweetId(oldestTweetIdOnPage, tweet.id);
            }

            const newPageTweets = visibleTweets.filter((tweet) => {
                if (pageSeenTweetIds.has(tweet.id)) {
                    return false;
                }

                pageSeenTweetIds.add(tweet.id);
                return true;
            });

            if (newPageTweets.length === 0) {
                idleScrolls += 1;
            } else {
                idleScrolls = 0;
            }

            for (const tweet of newPageTweets) {
                if (!latestSeenThisRun) {
                    latestSeenThisRun = tweet.id;
                }

                if (isTweetBeforeSinceDate(tweet, config.searchSinceDate)) {
                    stopReason = "since-date-reached";
                    break;
                }

                if (seenTweetIds.has(tweet.id)) {
                    continue;
                }

                seenTweetIds.add(tweet.id);
                acceptedCount += await processDiscoveredTweet({
                    apiClient,
                    classifier,
                    page,
                    tweet,
                    eventId: config.eventId,
                    searchQuery: persistedSearchQuery,
                    threadScrollDelayMs: config.threadScrollDelayMs,
                    threadIdleScrollLimit: config.threadIdleScrollLimit,
                    seenTweetIds,
                });
            }

            if (stopReason) {
                break;
            }

            const scrollResult = await scrollTimeline(page, config.scrollDelayMs);
            if (newPageTweets.length === 0 && scrollResult.atBottom && !scrollResult.moved) {
                break;
            }
        }

        console.log(
            JSON.stringify({
                type: "max-id-page-complete",
                pageCount,
                cursor,
                oldestTweetIdOnPage,
                stopReason,
            }),
        );

        if (stopReason) {
            break;
        }

        if (!oldestTweetIdOnPage) {
            stopReason = "no-tweets-visible";
            break;
        }

        if (cursor === oldestTweetIdOnPage || visitedCursors.has(oldestTweetIdOnPage)) {
            stopReason = "cursor-stalled";
            break;
        }

        visitedCursors.add(oldestTweetIdOnPage);
        cursor = oldestTweetIdOnPage;
    }

    if (pageCount >= config.maxIdReloadPageLimit && !stopReason) {
        stopReason = "page-limit-reached";
    }

    if (latestSeenThisRun && config.updateState) {
        await apiClient.updateState(config.stateId, {
            checkpoint: latestSeenThisRun,
            startTweetId: latestSeenThisRun,
            endTweetId: latestSeenThisRun,
            lastRunAt: new Date().toISOString(),
            lastSeenTweetId: latestSeenThisRun,
        });
    }

    if (acceptedCount > 0) {
        await apiClient.exportPublicFeed(config.eventId);
    }

    console.log(
        JSON.stringify({
            mode: config.runMode,
            acceptedCount,
            lastSeenAfterRun: latestSeenThisRun,
            sinceDate: config.searchSinceDate,
            initialMaxId: config.searchMaxId,
            finalMaxId: cursor,
            pageCount,
            stopReason,
            stateUpdated: config.updateState,
        }),
    );
}
