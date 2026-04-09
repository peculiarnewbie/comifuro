import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Stagehand } from "@browserbasehq/stagehand";
import type { Page } from "playwright";
import type { ExtractedTweet, ScraperConfig } from "./types";

const SEARCH_TIMELINE_SELECTOR = '[aria-label="Timeline: Search timeline"]';
const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const CDP_READY_TIMEOUT_MS = 15_000;
const MAX_THREAD_CONTINUATIONS = 24;

function normalizeTweet(raw: {
    id: string | null;
    user: string | null;
    displayName: string | null;
    text: string;
    tweetUrl: string | null;
    timestamp: string | null;
    matchedTags: string[];
    previewImageUrls: string[];
    hasQuotedTweet: boolean;
    rootTweetId?: string | null;
    parentTweetId?: string | null;
    threadPosition?: number | null;
    discoverySource: "search" | "thread";
}): ExtractedTweet | null {
    if (!raw.id || !raw.user || !raw.tweetUrl || !raw.timestamp) {
        return null;
    }

    return {
        id: raw.id,
        user: raw.user,
        displayName: raw.displayName ?? null,
        text: raw.text.trim(),
        tweetUrl: raw.tweetUrl,
        timestamp: raw.timestamp,
        matchedTags: raw.matchedTags,
        previewImageUrls: raw.previewImageUrls,
        hasQuotedTweet: raw.hasQuotedTweet,
        rootTweetId: raw.rootTweetId ?? null,
        parentTweetId: raw.parentTweetId ?? null,
        threadPosition: raw.threadPosition ?? null,
        discoverySource: raw.discoverySource,
    };
}

export function buildThreadContinuationChain(
    rootTweet: ExtractedTweet,
    tweets: ExtractedTweet[],
) {
    let rootSeen = false;
    let previousTweetId = rootTweet.id;
    const seenTweetIds = new Set<string>([rootTweet.id]);
    const chain: ExtractedTweet[] = [];
    const skipped = {
        beforeRoot: 0,
        mixedAuthor: 0,
        textOnly: 0,
        quoted: 0,
        duplicate: 0,
    };

    for (const tweet of tweets) {
        if (tweet.id === rootTweet.id) {
            rootSeen = true;
            continue;
        }

        if (!rootSeen) {
            skipped.beforeRoot += 1;
            continue;
        }

        if (seenTweetIds.has(tweet.id)) {
            skipped.duplicate += 1;
            continue;
        }

        seenTweetIds.add(tweet.id);

        if (tweet.user !== rootTweet.user) {
            skipped.mixedAuthor += 1;
            continue;
        }

        if (tweet.hasQuotedTweet) {
            skipped.quoted += 1;
            continue;
        }

        if (tweet.previewImageUrls.length === 0) {
            skipped.textOnly += 1;
            continue;
        }

        chain.push({
            ...tweet,
            rootTweetId: rootTweet.id,
            parentTweetId: previousTweetId,
            threadPosition: chain.length + 1,
            discoverySource: "thread",
        });

        previousTweetId = tweet.id;

        if (chain.length >= MAX_THREAD_CONTINUATIONS) {
            break;
        }
    }

    return {
        rootFound: rootSeen,
        chain,
        skipped,
    };
}

export async function connectStagehand(config: ScraperConfig) {
    const stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        localBrowserLaunchOptions: {
            cdpUrl: config.stagehandCdpUrl,
        },
    });

    await stagehand.init();
    return stagehand;
}

async function isCdpReachable(cdpUrl: string) {
    try {
        const response = await fetch(new URL("/json/version", cdpUrl), {
            signal: AbortSignal.timeout(2_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function ensureBrowserAvailable(config: ScraperConfig) {
    if (await isCdpReachable(config.stagehandCdpUrl)) {
        return;
    }

    if (!config.scraperBrowserCommand) {
        throw new Error(
            `CDP browser is not reachable at ${config.stagehandCdpUrl}. Start your browser with remote debugging enabled or set SCRAPER_BROWSER_COMMAND.`,
        );
    }

    console.log(`launching browser: ${config.scraperBrowserCommand}`);
    const subprocess = spawn(config.scraperBrowserCommand, {
        shell: true,
        detached: true,
        stdio: "ignore",
    });
    subprocess.unref();

    const startedAt = Date.now();
    while (Date.now() - startedAt < CDP_READY_TIMEOUT_MS) {
        if (await isCdpReachable(config.stagehandCdpUrl)) {
            return;
        }

        await sleep(300);
    }

    throw new Error(
        `Timed out waiting for a browser CDP endpoint at ${config.stagehandCdpUrl} after running SCRAPER_BROWSER_COMMAND.`,
    );
}

export async function findExistingPage(
    stagehand: Stagehand,
    config: ScraperConfig,
) {
    const pages = stagehand.context.pages();
    const matched =
        pages.find((page) => page.url().includes(config.scraperPageUrlMatch)) ??
        pages[0];

    if (!matched) {
        throw new Error(
            "No browser pages available. Open an authenticated X tab before running the scraper.",
        );
    }

    return matched;
}

export async function openLiveSearch(page: Page, query: string) {
    const target = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
    });
    await page.waitForSelector(SEARCH_TIMELINE_SELECTOR, {
        timeout: 60_000,
    });
    await page.waitForTimeout(4_000);
}

async function extractTweetsFromPage(
    page: Page,
    options?: {
        scopeSelector?: string;
        discoverySource?: "search" | "thread";
    },
) {
    const rawTweets = await page.evaluate(
        ({ scopeSelector, discoverySource }) => {
            const scope =
                (scopeSelector ? document.querySelector(scopeSelector) : null) ??
                document.body;
            const articles = Array.from(
                scope.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
            );

            return articles.map((article) => {
                const statusLinks = Array.from(
                    article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
                );
                const statusLink =
                    statusLinks.find((link) => link.querySelector("time")) ??
                    statusLinks[0];

                const tweetUrl = statusLink
                    ? new URL(
                          statusLink.getAttribute("href") ?? "",
                          location.origin,
                      ).toString()
                    : null;
                const idMatch = tweetUrl?.match(/status\/(\d+)/);
                const id = idMatch?.[1] ?? null;
                const userMatch = tweetUrl?.match(/x\.com\/([^/]+)\/status\//);
                const user = userMatch?.[1] ?? null;
                const text =
                    article.querySelector('[data-testid="tweetText"]')?.textContent ?? "";
                const timestamp =
                    article.querySelector("time")?.getAttribute("datetime") ?? null;
                const userNameRoot = article.querySelector('[data-testid="User-Name"]');
                const displayName =
                    userNameRoot?.querySelector("span")?.textContent?.trim() ?? null;

                const previewImageUrls = id
                    ? Array.from(
                          article.querySelectorAll<HTMLAnchorElement>(
                              `a[href*="/status/${id}/photo/"] img[src*="pbs.twimg.com/media"]`,
                          ),
                      )
                          .map((image) => image.getAttribute("src"))
                          .filter((value): value is string => Boolean(value))
                    : [];

                const matchedTags = Array.from(
                    new Set((text.match(/#\w+/gi) ?? []).map((tag) => tag.toLowerCase())),
                );
                const linkedStatusIds = Array.from(
                    new Set(
                        statusLinks
                            .map((link) => {
                                const href = link.getAttribute("href") ?? "";
                                const match = href.match(/status\/(\d+)/);
                                return match?.[1] ?? null;
                            })
                            .filter((value): value is string => Boolean(value)),
                    ),
                );

                return {
                    id,
                    user,
                    displayName,
                    text,
                    tweetUrl,
                    timestamp,
                    matchedTags,
                    previewImageUrls: Array.from(new Set(previewImageUrls)),
                    hasQuotedTweet: id
                        ? linkedStatusIds.some((statusId) => statusId !== id)
                        : linkedStatusIds.length > 0,
                    discoverySource,
                };
            });
        },
        {
            scopeSelector: options?.scopeSelector ?? null,
            discoverySource: options?.discoverySource ?? "search",
        },
    );

    return rawTweets
        .map(normalizeTweet)
        .filter((tweet): tweet is ExtractedTweet => tweet !== null);
}

export async function extractVisibleTweets(page: Page) {
    return await extractTweetsFromPage(page, {
        scopeSelector: SEARCH_TIMELINE_SELECTOR,
        discoverySource: "search",
    });
}

export async function openTweetDetailPage(
    sourcePage: Page,
    tweetUrl: string,
) {
    const detailPage = await sourcePage.context().newPage();
    await detailPage.goto(tweetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
    });
    await detailPage.waitForSelector(TWEET_ARTICLE_SELECTOR, {
        timeout: 60_000,
    });
    await detailPage.waitForTimeout(3_000);
    return detailPage;
}

export async function crawlThreadContinuations(params: {
    page: Page;
    rootTweet: ExtractedTweet;
    scrollDelayMs: number;
    idleScrollLimit: number;
}) {
    const { page, rootTweet, scrollDelayMs, idleScrollLimit } = params;
    let idleScrolls = 0;
    let lastResult = buildThreadContinuationChain(rootTweet, []);

    while (
        idleScrolls < idleScrollLimit &&
        lastResult.chain.length < MAX_THREAD_CONTINUATIONS
    ) {
        const visibleTweets = await extractTweetsFromPage(page, {
            discoverySource: "thread",
        });
        const nextResult = buildThreadContinuationChain(rootTweet, visibleTweets);

        if (nextResult.chain.length > lastResult.chain.length) {
            lastResult = nextResult;
            idleScrolls = 0;
        } else {
            lastResult = nextResult;
            idleScrolls += 1;
        }

        if (
            idleScrolls < idleScrollLimit &&
            lastResult.chain.length < MAX_THREAD_CONTINUATIONS
        ) {
            await scrollTimeline(page, scrollDelayMs);
        }
    }

    return lastResult;
}

export async function scrollTimeline(page: Page, delayMs: number) {
    await page.evaluate(() => {
        window.scrollBy({
            top: Math.round(window.innerHeight * 0.85),
            behavior: "smooth",
        });
    });
    await page.waitForTimeout(delayMs);
}
