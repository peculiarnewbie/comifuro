import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ApiClient } from "./api-client";
import { RunStore } from "./run-store";
import { processDiscoveredTweet } from "./pipeline/tweet-processor";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { crawlThreadContinuations, inspectTimeline } from "./browser";
import type { ExtractedTweet } from "./types";

let browser: Browser;
before(async () => {
    browser = await chromium.launch({
        headless: true,
        executablePath: process.env.SCRAPER_TEST_BROWSER,
    });
});
after(async () => {
    await browser?.close();
});

const article = (id: string, text = "catalogue") => `<article data-testid="tweet">
    <a href="/artist/status/${id}"><time datetime="2026-04-01T00:00:00Z"></time></a>
    <div data-testid="tweetText">${text}</div>
    <a href="/artist/status/${id}/photo/1"><img src="https://pbs.twimg.com/media/${id}.jpg"></a>
</article>`;
const root: ExtractedTweet = {
    id: "100",
    user: "artist",
    displayName: null,
    text: "catalogue",
    timestamp: "2026-04-01T00:00:00Z",
    tweetUrl: "https://x.com/artist/status/100",
    matchedTags: [],
    previewImageUrls: [],
    hasQuotedTweet: false,
    rootTweetId: null,
    parentTweetId: null,
    threadPosition: null,
    discoverySource: "search",
};

async function pageWith(html: string) {
    const page = await browser.newPage();
    // Every request is fulfilled locally, including images. Tests never contact X.
    await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://x.com/search");
    return page;
}

void test("thread collection retains earlier replies after X removes them from the DOM", async () => {
    const page = await pageWith(`<main>${article("100")}${article("101")}</main>`);
    try {
        await page.evaluate(
            (next) => {
                window.scrollBy = () => {
                    document.querySelector("main")!.innerHTML = next;
                };
            },
            article("101") + article("102"),
        );
        const result = await crawlThreadContinuations({
            page,
            rootTweet: root,
            scrollDelayMs: 10,
            idleScrollLimit: 2,
        });
        assert.deepEqual(
            result.chain.map((tweet) => tweet.id),
            ["101", "102"],
        );
        assert.equal(result.chain[1]?.parentTweetId, "101");
    } finally {
        await page.close();
    }
});

void test("search health distinguishes empty results, site errors, and tweet text", async () => {
    const page = await pageWith(
        `<div aria-label="Timeline: Search timeline">${article("100", "rate limit exceeded")}</div>`,
    );
    try {
        assert.equal(await inspectTimeline(page), "ready");
        await page.setContent('<div data-testid="emptyState">No results for #cf22</div>');
        assert.equal(await inspectTimeline(page), "empty");
        await page.setContent('<div role="alert">Something went wrong</div>');
        await assert.rejects(inspectTimeline(page), /requires attention/);
        await page.setContent('<div role="alert">Rate limit exceeded</div>');
        await assert.rejects(inspectTimeline(page), /limiting requests/);
    } finally {
        await page.close();
    }
});

void test("a thread upload retry reuses the saved classification and chain", async () => {
    const pixel = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
        .png()
        .toBuffer();
    let failThumbnail = true;
    let imageFetches = 0;
    let upserts = 0;
    const server = createServer(async (request, response) => {
        if (request.url?.startsWith("/image")) {
            imageFetches += 1;
            response.writeHead(200, { "content-type": "image/png" });
            response.end(pixel);
            return;
        }
        for await (const _chunk of request) {
            /* drain multipart bodies */
        }
        if (request.url?.includes("thumb") && failThumbnail) {
            response.writeHead(401);
            response.end();
            return;
        }
        if (request.url?.endsWith("upsert")) upserts += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const directory = mkdtempSync(join(tmpdir(), "scraper-stages-"));
    const store = new RunStore(join(directory, "runs.sqlite"));
    store.acquire();
    const run = store.start({ query: "test" }, null, null);
    const journal = store.taskJournal(run.id, root.id);
    journal.write("root-result", {
        accepted: true,
        classifierPromptVersion: "test",
        inferredBoothId: null,
        inferredBoothIdConfidence: null,
    });
    journal.write("thread-chain", [
        {
            ...root,
            id: "101",
            rootTweetId: "100",
            parentTweetId: "100",
            threadPosition: 1,
            discoverySource: "thread",
            previewImageUrls: [`${baseUrl}/image`],
        },
    ]);
    const page = await pageWith(article("100"));
    const params = {
        apiClient: new ApiClient({ apiBaseUrl: baseUrl, apiPassword: "test" }),
        page,
        tweet: root,
        eventId: "cf22",
        searchQuery: "test",
        journal,
        threadScrollDelayMs: 1,
        threadIdleScrollLimit: 1,
        classifier: {
            promptVersion: "test",
            fingerprint: "test",
            classify: async () => {
                throw new Error("must reuse saved classifier result");
            },
        },
    };
    try {
        await assert.rejects(processDiscoveredTweet(params), /HTTP 401/);
        failThumbnail = false;
        assert.equal(await processDiscoveredTweet(params), 2);
        assert.equal(upserts, 1);
        assert.equal(imageFetches, 2);
        assert.equal(await processDiscoveredTweet(params), 2);
        assert.equal(imageFetches, 2);
        assert.equal(upserts, 1);
    } finally {
        await page.close();
        store.close();
        rmSync(directory, { recursive: true, force: true });
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
