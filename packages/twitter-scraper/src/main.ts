import type { Stagehand } from "@browserbasehq/stagehand";
import { ApiClient } from "./api-client";
import {
    connectStagehand,
    extractVisibleTweets,
    findExistingPage,
    openLiveSearch,
    scrollTimeline,
} from "./browser";
import { loadConfig } from "./config";
import { uploadTweetImages } from "./images";
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

async function processTweet(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    tweet: ExtractedTweet;
    searchQuery: string;
}) {
    const { apiClient, classifier, tweet, searchQuery } = params;
    const classification = await classifier.classify({
        tweetText: tweet.text,
        matchedTags: tweet.matchedTags,
        searchQuery,
    });

    if (!classification.isCatalogue) {
        await apiClient.upsertTweet({
            id: tweet.id,
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
            media: [],
        });
        console.log(`skip ${tweet.id}: ${classification.reason}`);
        return false;
    }

    const media = await uploadTweetImages(apiClient, tweet);
    const imageMask = buildImageMask(media.map((item) => item.mediaIndex));

    await apiClient.upsertTweet({
        id: tweet.id,
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
                ? classification.reason
                : "classified as catalogue but no downloadable images were found",
        classifierPromptVersion: classifier.promptVersion,
        media,
    });

    console.log(`stored ${tweet.id}: ${media.length} image(s)`);
    return media.length > 0;
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
                const accepted = await processTweet({
                    apiClient,
                    classifier,
                    tweet,
                    searchQuery: config.searchQuery,
                });

                if (accepted) {
                    acceptedCount += 1;
                }
            } catch (error) {
                console.error(`failed ${tweet.id}`, error);
                await apiClient.upsertTweet({
                    id: tweet.id,
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
        await apiClient.exportPublicFeed();
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

async function main() {
    const config = loadConfig();

    try {
        stagehand = await connectStagehand(config);
        await run(stagehand, config);
        process.exit(0);
    } finally {
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
