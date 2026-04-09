import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { Stagehand } from "@browserbasehq/stagehand";
import type { Page } from "playwright";
import type { ExtractedTweet, ScraperConfig } from "./types";

const SEARCH_TIMELINE_SELECTOR = '[aria-label="Timeline: Search timeline"]';
const CDP_READY_TIMEOUT_MS = 15_000;

function normalizeTweet(raw: {
    id: string | null;
    user: string | null;
    displayName: string | null;
    text: string;
    tweetUrl: string | null;
    timestamp: string | null;
    matchedTags: string[];
    previewImageUrls: string[];
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

export async function extractVisibleTweets(page: Page) {
    const rawTweets = await page.evaluate((selector) => {
        const timeline =
            document.querySelector(selector) ?? document.body;
        const articles = Array.from(
            timeline.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
        );

        return articles.map((article) => {
            const statusLinks = Array.from(
                article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
            );
            const statusLink =
                statusLinks.find((link) => link.querySelector("time")) ?? statusLinks[0];

            const tweetUrl = statusLink
                ? new URL(statusLink.getAttribute("href") ?? "", location.origin).toString()
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

            return {
                id,
                user,
                displayName,
                text,
                tweetUrl,
                timestamp,
                matchedTags,
                previewImageUrls: Array.from(new Set(previewImageUrls)),
            };
        });
    }, SEARCH_TIMELINE_SELECTOR);

    return rawTweets
        .map(normalizeTweet)
        .filter((tweet): tweet is ExtractedTweet => tweet !== null);
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
