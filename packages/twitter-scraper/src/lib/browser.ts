import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { processArticles } from "../daily";

export const getBrowserInstance = async () => {
    try {
        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        console.log("Connected to existing browser instance");
        return await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
    } catch (e) {
        console.log(
            "No existing browser found, launching new Chromium instance..."
        );

        const chromiumProcess = Bun.spawn(
            [
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
            ],
            {
                stdio: ["ignore", "pipe", "pipe"],
            }
        );

        console.log("Launched Chromium with PID:", chromiumProcess.pid);

        await Bun.sleep(3000);

        const browserWs = await fetch("http://localhost:9222/json/version");
        const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
        return await puppeteer.connect({
            browserWSEndpoint: browserEndpoint,
        });
    }
};

export const openLatestTweets = async (browser: Browser, query: string) => {
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
    const url = `https://x.com/search?q=${query}&src=typed_query&f=live`;

    await page.goto(url);

    return page;
};

export const crawlPage = async (
    browser: Browser,
    page: Page,
    maxRetries: number = 3,
    timeLimit?: number
) => {
    console.log("set viewport");
    await page.setViewport({
        width: 1000,
        height: 1000,
        deviceScaleFactor: 1,
    });

    let articles = await getCurrentArticlesOnPage(page);
    let offset = 0;
    let currentArticlesCache: ElementHandle<HTMLElement>[] | undefined = [];
    console.log("articles length", articles?.length);
    console.log("timeLimit", timeLimit);

    while (true) {
        if (!articles) process.abort();

        const { currentArticle, shouldStop } = await processArticles(
            browser,
            articles,
            maxRetries,
            timeLimit
        );

        offset = offset + articles.length;

        if (shouldStop) {
            console.log("Reached previously processed tweets, stopping");
            break;
        }

        const { nextArticles, startIndex, shouldBreak } =
            await scrollAndGetNewArticles(
                page,
                currentArticlesCache,
                currentArticle
            );

        if (shouldBreak) break;

        currentArticlesCache = nextArticles;
        articles = nextArticles.slice(startIndex);

        console.log("next", articles?.length, offset);
    }
};

const scrollAndGetNewArticles = async (
    page: Page,
    currentArticlesCache: ElementHandle<HTMLElement>[] | undefined,
    currentArticle: ElementHandle<HTMLElement> | null | undefined
) => {
    // await page.evaluate(() => {
    //     window.scrollTo(0, document.body.scrollHeight);
    // });

    currentArticle?.evaluate((el) => {
        el.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    });

    await Bun.sleep(3000);

    const nextArticles = await getCurrentArticlesOnPage(page);

    if (!nextArticles || currentArticlesCache == nextArticles) {
        console.log("No more articles found, ending scrape");
        return { nextArticles: [], startIndex: 0, shouldBreak: true };
    }

    let startIndex = 0;

    const evaluated = await currentArticle?.evaluate((el) => {
        return el.innerText;
    });

    for (let i = 0; i < nextArticles.length; i++) {
        const currentEval = await nextArticles[i]?.evaluate((el) => {
            return el.innerText;
        });
        if (currentEval == evaluated) {
            startIndex = i + 1;
            break;
        }
    }

    return { nextArticles, startIndex, shouldBreak: false };
};

export const downloadImage = async (image: ElementHandle<any>) => {
    await image.evaluate(async (node) => {
        if (node.getAttribute("alt") === "placeholder") return;
        const imgSrc = node.getAttribute("src");
        const document = node.ownerDocument;
        const response = await fetch(imgSrc, { mode: "cors" });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "twitter-image.jpg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
};

const getCurrentArticlesOnPage = async (page: Page) => {
    const timeline = await page.$("[aria-label='Timeline: Search timeline']");
    const articles = await timeline?.$$(`article[tabindex="0"]`);
    return articles;
};
