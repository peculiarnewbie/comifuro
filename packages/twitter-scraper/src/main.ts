import puppeteer, { type Page, type Browser } from "puppeteer";
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
    maxRetries: number = 3
) => {
    if (!page) process.abort();
    await page.setViewport({
        width: 1920,
        height: 1000,
        deviceScaleFactor: 1,
    });

    let articles = await getCurrentArticlesOnPage(page);
    let offset = 0;
    console.log(articles?.length);

    while (true) {
        if (!articles) process.abort();

        const { currentArticle, index, shouldStop } = await processArticles(
            browser,
            page,
            articles,
            offset,
            destination,
            downloadDir,
            processedTweets,
            maxRetries
        );

        if (shouldStop) {
            console.log("Reached previously processed tweets, stopping");
            break;
        }

        const evaluated = await currentArticle?.evaluate((el) => {
            return el.innerText;
        });

        const nextArticles = await getCurrentArticlesOnPage(page);

        if (!nextArticles) process.exit(0);

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
        offset = offset + startIndex;

        console.log("next", articles?.length, offset);

        if (articles.length == 0) break;
    }
};

async function main() {
    const maxRetries = parseInt(process.env.MAX_RETRIES ?? "3");
    
    await ensureDir(distDir);

    const processedTweets = await loadProcessedTweets(distDir);
    console.log(`Loaded ${processedTweets.size} previously processed tweets`);

    const browserWs = await fetch("http://localhost:9222/json/version");
    const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
    const browser = await puppeteer.connect({
        browserWSEndpoint: browserEndpoint,
    });

    const [page, _] = await browser.pages();

    if (!page) {
        console.error("no page in browser");
        process.abort();
    }

    console.log("crawling latest tweets");
    const url = `https://x.com/search?q=cf21catalogue&src=typed_query&f=live`;

    page.goto(url);
    await page.waitForNetworkIdle();
    await sleep(2000);

    await crawlPage(browser, page, distDir, processedTweets, maxRetries);

    await saveProcessedTweets(distDir, processedTweets);
    console.log("done");
}

if (import.meta.main) {
    main();
}
