import puppeteer, { type Page, type Browser, ElementHandle } from "puppeteer";
import {
    ensureDir,
    findProjectRoot,
    getCurrentArticlesOnPage,
    processArticles,
    loadProcessedTweets,
    saveProcessedTweets,
} from "./daily";
import { sleep } from "bun";

export const downloadDir = process.env.DOWNLOADS_DIR ?? "";
export const distDir = `${await findProjectRoot()}/dist/`;

const crawlPage = async (
    browser: Browser,
    page: Page,
    destination: string,
    processedTweets: Set<string>,
    maxRetries: number = 3,
    isFirstRun: boolean = false
) => {
    console.log("set viewport")
    await page.setViewport({
        width: 1920,
        height: 1000,
        deviceScaleFactor: 1,
    });

    let articles = await getCurrentArticlesOnPage(page);
    let offset = 0;
    let lastArticleCount = 0;
    let currentArticlesCache: ElementHandle<HTMLElement>[] | undefined = []
    console.log("articles length", articles?.length);

    while (true) {
        if (!articles) process.abort();

        const { currentArticle, shouldStop } = await processArticles(
            browser,
            page,
            articles,
            offset,
            destination,
            downloadDir,
            processedTweets,
            maxRetries,
            isFirstRun
        );

        if (shouldStop && !isFirstRun) {
            console.log("Reached previously processed tweets, stopping");
            break;
        }

        // Update offset by the number of articles we just processed
        offset = offset + articles.length;

        const evaluated = await currentArticle?.evaluate((el) => {
            return el.innerText;
        });

        // Scroll to load more tweets
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        await sleep(3000); // Wait for new tweets to load

        const nextArticles = await getCurrentArticlesOnPage(page);

        if (!nextArticles || currentArticlesCache == nextArticles) {
            console.log("No more articles found, ending scrape");
            break;
        }

        currentArticlesCache = nextArticles

        let startIndex = 0;

        for (let i = 0; i < nextArticles.length; i++) {
            const currentEval = await nextArticles[i]?.evaluate((el) => {
                return el.innerText;
            });
            if (currentEval == evaluated) {
                startIndex = i + 1;
                break;
            }
        }

        articles = nextArticles.slice(startIndex);

        console.log("next", articles?.length, offset);

        lastArticleCount = nextArticles.length;
    }
};

const getBrowserInstance = async () => {
    try {
        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        console.log("Connected to existing browser instance");
        return await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
    } catch (e) {
        console.log("No existing browser found, launching new Chromium instance...");

        const chromiumProcess = Bun.spawn([
            "chromium",
            "--remote-debugging-port=9222",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-web-security",
        ], {
            stdio: ["ignore", "pipe", "pipe"]
        });

        console.log("Launched Chromium with PID:", chromiumProcess.pid);

        await sleep(3000);

        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        return await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
    }

}

const openLatestTweets = async (browser: Browser) => {
    const pages = await browser.pages();
    let page = pages[0];

    if (!page) {
        page = await browser.newPage();
    }

    if (!page) {
        console.error("no page in browser");
        process.abort();
    }

    console.log("navigate to latest tweet");
    const url = `https://x.com/search?q=cf21catalogue&src=typed_query&f=live`;

    await page.goto(url);
    await sleep(2000);

    return page
}

async function main() {
    const maxRetries = parseInt(process.env.MAX_RETRIES ?? "3");

    await ensureDir(distDir);

    const processedTweets = await loadProcessedTweets(distDir);
    const isFirstRun = processedTweets.size === 0;

    const browser = await getBrowserInstance();

    const page = await openLatestTweets(browser)

    console.log("start crawling")
    await crawlPage(browser, page, distDir, processedTweets, maxRetries, isFirstRun);

    await saveProcessedTweets(distDir, processedTweets);
    console.log("done");
}

if (import.meta.main) {
    main();
}
