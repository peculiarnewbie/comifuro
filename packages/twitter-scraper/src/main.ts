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
    maxRetries: number = 3,
    isFirstRun: boolean = false
) => {
    if (!page) process.abort();
    await page.setViewport({
        width: 1920,
        height: 1000,
        deviceScaleFactor: 1,
    });

    let articles = await getCurrentArticlesOnPage(page);
    let offset = 0;
    let consecutiveEmptyLoads = 0;
    let lastArticleCount = 0;
    console.log(articles?.length);

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

        const evaluated = await currentArticle?.evaluate((el) => {
            return el.innerText;
        });

        // Scroll to load more tweets
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        
        await sleep(3000); // Wait for new tweets to load

        const nextArticles = await getCurrentArticlesOnPage(page);

        if (!nextArticles) {
            console.log("No more articles found, ending scrape");
            break;
        }

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

        // Check if we're getting new articles
        if (articles.length === 0) {
            consecutiveEmptyLoads++;
            console.log(`No new articles loaded (${consecutiveEmptyLoads}/3)`);
            
            if (consecutiveEmptyLoads >= 3) {
                console.log("No new tweets loading after multiple attempts, ending scrape");
                break;
            }
            
            // Try scrolling more aggressively
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight + 1000);
            });
            await sleep(5000);
            
            const retryArticles = await getCurrentArticlesOnPage(page);
            if (retryArticles && retryArticles.length > lastArticleCount) {
                articles = retryArticles.slice(lastArticleCount);
                consecutiveEmptyLoads = 0;
            }
        } else {
            consecutiveEmptyLoads = 0;
        }

        lastArticleCount = nextArticles.length;

        // For first run, check if we've hit the end of search results
        if (isFirstRun) {
            const endOfResults = await page.$('text="You\'ve reached the end of your search results"') || 
                                await page.$('text="Nothing to see here — yet"') ||
                                await page.$('[data-testid="emptyState"]');
            
            if (endOfResults) {
                console.log("Reached end of search results");
                break;
            }
        }
    }
};

async function main() {
    const maxRetries = parseInt(process.env.MAX_RETRIES ?? "3");
    
    await ensureDir(distDir);

    const processedTweets = await loadProcessedTweets(distDir);
    const isFirstRun = processedTweets.size === 0;
    console.log(`Loaded ${processedTweets.size} previously processed tweets`);
    console.log(`Mode: ${isFirstRun ? "First run - will scrape all tweets" : "Resume mode - will scrape until reaching previous tweets"}`);

    let browser;
    
    try {
        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        browser = await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
        console.log("Connected to existing browser instance");
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
            "--user-data-dir=/tmp/chromium-scraper"
        ], {
            stdio: ["ignore", "pipe", "pipe"]
        });

        console.log("Launched Chromium with PID:", chromiumProcess.pid);
        
        // Wait for browser to start up
        await sleep(3000);
        
        // Now connect to it
        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        browser = await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
        
        console.log("Connected to spawned Chromium instance");
    }

    const pages = await browser.pages();
    let page = pages[0];
    
    if (!page) {
        page = await browser.newPage();
    }

    if (!page) {
        console.error("no page in browser");
        process.abort();
    }

    console.log("crawling latest tweets");
    const url = `https://x.com/search?q=cf21catalogue&src=typed_query&f=live`;

    await page.goto(url);
    await page.waitForNetworkIdle();
    await sleep(2000);

    await crawlPage(browser, page, distDir, processedTweets, maxRetries, isFirstRun);

    await saveProcessedTweets(distDir, processedTweets);
    console.log("done");
}

if (import.meta.main) {
    main();
}
