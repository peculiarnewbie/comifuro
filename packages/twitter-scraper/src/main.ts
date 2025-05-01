import puppeteer, { type Page } from "puppeteer";
import {
    ensureDir,
    findProjectRoot,
    getCurrentArticlesOnPage,
    processArticles,
} from "./daily";
import { sleep } from "bun";

const downloadDir = process.env.DOWNLOADS_DIR ?? "";
const distDir = `${await findProjectRoot()}/dist/`;

const crawlPage = async (page: Page, destination: string) => {
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

        const { currentArticle, index } = await processArticles(
            page,
            articles,
            offset,
            destination,
            downloadDir
        );

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
                console.log("found last article", i, currentEval, evaluated);
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
    await ensureDir(distDir);

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

    let startingDate = 30;
    let month = 4;

    while (startingDate > 1) {
        console.log("crawling: ", startingDate);
        const url = `https://x.com/search?q=cfxxcatalogue%20until%3A2025-${month}-${startingDate}%20since%3A2025-${month}-${
            startingDate - 1
        }&src=typed_query&f=live`;

        page.goto(url);
        await page.waitForNetworkIdle();
        await sleep(2000);

        await crawlPage(page, `${distDir}25-${month}-${startingDate}/`);

        startingDate--;
    }
}

main();
