import { createHash } from "node:crypto";
import { withSpan, traceIds } from "../telemetry";
import type { Page } from "playwright";
import type { ApiClient } from "../api-client";
import { buildSearchQuery } from "../cli";
import {
    extractVisibleTweets,
    inspectTimeline,
    openLiveSearch,
    scrollTimeline,
    TimelineRateLimitError,
    TimelineUnavailableError,
} from "../browser";
import type { createClassifier } from "../opencode";
import type { ExtractedTweet, ScraperConfig } from "../types";
import { RunStore, type TaskJournal } from "../run-store";
import { Runtime, HttpError } from "../runtime";
import { processDiscoveredTweet } from "./tweet-processor";

export const compareTweetIds = (left: string, right: string) =>
    BigInt(left) > BigInt(right) ? 1 : BigInt(left) < BigInt(right) ? -1 : 0;

export function scopedStateId(
    config: Pick<ScraperConfig, "eventId" | "stateId" | "searchQuery" | "searchSinceDate">,
) {
    const fingerprint = createHash("sha256")
        .update(
            JSON.stringify({
                event: config.eventId,
                query: buildSearchQuery(config.searchQuery, { since: config.searchSinceDate }),
            }),
        )
        .digest("hex")
        .slice(0, 16);
    return `${config.stateId}:${fingerprint}`;
}

// Browser operations are a port so recovery tests can supply X timeline fixtures.
export type SearchSource = {
    open(query: string): Promise<void>;
    read(): Promise<{ tweets: ExtractedTweet[]; empty: boolean }>;
    scroll(): Promise<unknown>;
};

export async function runSearch(params: {
    config: ScraperConfig;
    store: RunStore;
    apiClient: Pick<ApiClient, "getState" | "updateState" | "exportPublicFeed">;
    source: SearchSource;
    processTweet: (
        tweet: ExtractedTweet,
        runtime: Runtime,
        journal: TaskJournal,
    ) => Promise<number>;
    signal: AbortSignal;
    promptVersion: string;
    runtime?: Runtime;
}) {
    const { config, store, apiClient, source, signal } = params;
    const runtime = params.runtime ?? new Runtime(signal);
    runtime.onCooldown = (until) => store.recordCooldown(until);
    await runtime.wait(Math.max(0, store.cooldownDeadline() - Date.now()));
    const persistedQuery = buildSearchQuery(config.searchQuery, { since: config.searchSinceDate });
    const remoteStateId = scopedStateId(config);
    const state = config.runMode === "default" ? await apiClient.getState(remoteStateId) : null;
    // Query-scoped state avoids importing unrelated or unsafe legacy checkpoints.
    const run = store.start(
        {
            api: config.apiBaseUrl.replace(/\/+$/, ""),
            event: config.eventId,
            state: remoteStateId,
            mode: config.runMode,
            query: persistedQuery,
            initialMaxId: config.searchMaxId,
            updateState: config.updateState,
            promptVersion: params.promptVersion,
        },
        state?.checkpoint ?? null,
        config.runMode === "max-id" ? config.searchMaxId : null,
    );
    const progress = run.progress;
    progress.notBefore = Math.max(progress.notBefore, store.cooldownDeadline());
    runtime.onCooldown = (until, reason) => {
        store.recordCooldown(until);
        progress.notBefore = Math.max(progress.notBefore, until);
        store.save(run.id, progress);
        console.log(
            JSON.stringify({
                type: "cooldown",
                runId: run.id,
                until: new Date(until).toISOString(),
                reason,
            }),
        );
    };
    const emit = (type: string, extra: Record<string, unknown> = {}) =>
        console.log(
            JSON.stringify({
                type,
                ...traceIds(),
                runId: run.id,
                attemptId: run.attemptId,
                at: new Date().toISOString(),
                ...extra,
            }),
        );
    emit("run-start", { resumed: run.resumed, journal: store.path, ...progress });
    const heartbeat = setInterval(() => {
        store.save(run.id, progress);
        emit("heartbeat", {
            cursor: progress.cursor,
            processed: progress.processed,
            accepted: progress.accepted,
        });
    }, 30_000);
    heartbeat.unref();

    let consecutiveFailures = 0;
    const drain = async () => {
        for (let tweet = store.pending(run.id); tweet; tweet = store.pending(run.id)) {
            signal.throwIfAborted();
            store.beginTask(run.id, tweet.id);
            // Side effects can succeed before their response arrives. Always export after a retry/partial write.
            progress.exportPending = true;
            store.save(run.id, progress);
            try {
                const accepted = await withSpan(
                    "scraper.tweet",
                    { "scraper.run_id": run.id, "tweet.id": tweet.id },
                    () => params.processTweet(tweet, runtime, store.taskJournal(run.id, tweet.id)),
                );
                consecutiveFailures = 0;
                progress.processed += 1;
                progress.accepted += accepted;
                store.completeTask(run.id, tweet.id, accepted, progress);
                emit("tweet-complete", { tweetId: tweet.id, accepted });
            } catch (error) {
                store.failTask(
                    run.id,
                    tweet.id,
                    error instanceof Error ? error.message : String(error),
                );
                consecutiveFailures += 1;
                emit("tweet-failed", {
                    tweetId: tweet.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (
                    signal.aborted ||
                    error instanceof TimelineRateLimitError ||
                    error instanceof TimelineUnavailableError ||
                    error instanceof TypeError ||
                    (error instanceof Error &&
                        ["TimeoutError", "AbortError"].includes(error.name)) ||
                    (error instanceof HttpError && ![400, 404, 422].includes(error.status)) ||
                    consecutiveFailures >= 3
                )
                    throw error;
            }
            await runtime.wait(config.scrollDelayMs);
        }
    };
    let reason = progress.boundaryReached ? "scan-complete" : "page-limit-reached";
    try {
        await runtime.wait(Math.max(0, progress.notBefore - Date.now()));
        await drain();
        for (
            let pageCount = 0;
            pageCount < config.maxIdReloadPageLimit && !progress.boundaryReached;
            pageCount += 1
        ) {
            await runtime.cooldown(config.pageDelayMs, "search-page-pacing");
            let oldest: string | null = null;
            let idle = 0;
            const pageSeen = new Set<string>();
            try {
                await source.open(buildSearchQuery(persistedQuery, { maxId: progress.cursor }));
                for (
                    let scroll = 0;
                    scroll < config.maxScrollsPerPage && idle < config.idleScrollLimit;
                    scroll += 1
                ) {
                    signal.throwIfAborted();
                    const { tweets, empty } = await source.read();
                    if (empty && tweets.length === 0) {
                        progress.boundaryReached = true;
                        reason = "search-exhausted";
                        break;
                    }
                    const fresh = tweets.filter(
                        (tweet) =>
                            !pageSeen.has(tweet.id) &&
                            (!progress.cursor || compareTweetIds(tweet.id, progress.cursor) <= 0),
                    );
                    fresh.sort((left, right) => compareTweetIds(right.id, left.id));
                    idle = fresh.length ? 0 : idle + 1;
                    let boundary = false;
                    const eligible: ExtractedTweet[] = [];
                    for (const tweet of fresh) {
                        pageSeen.add(tweet.id);
                        if (
                            (progress.checkpoint &&
                                compareTweetIds(tweet.id, progress.checkpoint) <= 0) ||
                            (config.searchSinceDate &&
                                Date.parse(tweet.timestamp) <
                                    Date.parse(`${config.searchSinceDate}T00:00:00Z`))
                        ) {
                            boundary = true;
                            continue;
                        }
                        if (!progress.newest || compareTweetIds(tweet.id, progress.newest) > 0)
                            progress.newest = tweet.id;
                        if (!oldest || compareTweetIds(tweet.id, oldest) < 0) oldest = tweet.id;
                        eligible.push(tweet);
                    }
                    store.enqueue(run.id, eligible, progress);
                    await drain();
                    if (boundary) {
                        progress.boundaryReached = true;
                        reason = "checkpoint-or-since-reached";
                        break;
                    }
                    await source.scroll();
                }
            } catch (error) {
                if (!(error instanceof TimelineRateLimitError)) throw error;
                await runtime.cooldown(error.retryAfterMs, "x-rate-limited");
                // Replay the same page; durable completed tasks suppress repeated processing.
                continue;
            }
            progress.pages += 1;
            if (oldest) progress.cursor = (BigInt(oldest) - 1n).toString();
            store.save(run.id, progress);
            emit("page-complete", { ...progress });
            if (!oldest && !progress.boundaryReached) {
                reason = "timeline-stalled";
                break;
            }
        }
        if (progress.exportPending) {
            await apiClient.exportPublicFeed(config.eventId);
            progress.exportPending = false;
            store.save(run.id, progress);
        }
        const unfinished = store.unfinishedCount(run.id);
        if (unfinished) reason = "pending-failures";
        // Backfills never move the incremental high-water mark, even when capped or exhausted.
        if (
            !unfinished &&
            progress.boundaryReached &&
            progress.newest &&
            config.updateState &&
            config.runMode === "default" &&
            (!state?.checkpoint || compareTweetIds(progress.newest, state.checkpoint) > 0)
        ) {
            await apiClient.updateState(remoteStateId, {
                checkpoint: progress.newest,
                startTweetId: progress.newest,
                endTweetId: progress.newest,
                lastRunAt: new Date().toISOString(),
                lastSeenTweetId: progress.newest,
            });
        }
        const status = progress.boundaryReached && !unfinished ? "completed" : "paused";
        store.finish(run, status, reason);
        emit("run-end", { status, reason, ...progress });
        return { status, reason, runId: run.id };
    } catch (error) {
        if (error instanceof TimelineRateLimitError)
            runtime.onCooldown(Date.now() + error.retryAfterMs, "x-rate-limited");
        const reason = signal.aborted
            ? "interrupted"
            : error instanceof Error
              ? error.message
              : String(error);
        store.finish(run, signal.aborted ? "paused" : "failed", reason);
        emit("run-end", { status: signal.aborted ? "paused" : "failed", reason, ...progress });
        throw error;
    } finally {
        clearInterval(heartbeat);
    }
}

export function browserSearchSource(page: Page, config: ScraperConfig): SearchSource {
    return {
        open: (query) => openLiveSearch(page, query),
        read: async () => {
            const state = await inspectTimeline(page);
            return {
                tweets: state === "empty" ? [] : await extractVisibleTweets(page),
                empty: state === "empty",
            };
        },
        scroll: () => scrollTimeline(page, config.scrollDelayMs),
    };
}

export function tweetProcessor(params: {
    apiClient: ApiClient;
    classifier: Awaited<ReturnType<typeof createClassifier>>;
    page: Page;
    config: ScraperConfig;
}) {
    return (tweet: ExtractedTweet, runtime: Runtime, journal: TaskJournal) =>
        processDiscoveredTweet({
            apiClient: params.apiClient,
            classifier: params.classifier,
            page: params.page,
            tweet,
            eventId: params.config.eventId,
            searchQuery: buildSearchQuery(params.config.searchQuery, {
                since: params.config.searchSinceDate,
            }),
            threadScrollDelayMs: params.config.threadScrollDelayMs,
            threadIdleScrollLimit: params.config.threadIdleScrollLimit,
            runtime,
            journal,
        });
}
