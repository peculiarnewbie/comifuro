import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

interface Tweet {
    text: string;
}

(async () => {
    // Replace 'YOUR_BROWSER_ID' with the actual ID from your instance.
    const browserWSEndpoint: string =
        "ws://localhost:9222/devtools/browser/YOUR_BROWSER_ID";
    const browser: Browser = await puppeteer.connect({ browserWSEndpoint });

    // Open a new tab.
    const page: Page = await browser.newPage();

    // Use Twitter's search URL with your desired query.
    const searchQuery: string = "puppeteer";
    const url: string = `https://twitter.com/search?q=${encodeURIComponent(
        searchQuery
    )}&src=typed_query`;

    await page.goto(url, { waitUntil: "networkidle2" });
    console.log(`Navigated to ${url}`);

    // Set to track unique tweets.
    const tweetSet: Set<string> = new Set();
    let tweetsBatch: Tweet[] = [];
    let batchCount: number = 0;

    // Helper function to write tweet batches to a JSON file.
    const writeBatchToFile = (batchData: Tweet[]): void => {
        const fileName = path.join(
            __dirname,
            `tweets_batch_${batchCount}.json`
        );
        fs.writeFileSync(fileName, JSON.stringify(batchData, null, 2));
        console.log(
            `Batch #${batchCount} saved with ${batchData.length} unique tweets.`
        );
        batchCount += 1;
    };

    // Function to extract tweet texts from Twitter's infinite scroll.
    async function extractTweets(): Promise<string[]> {
        return await page.evaluate((): string[] => {
            // Twitter renders tweets inside <article> elements.
            const articles: NodeListOf<HTMLElement> =
                document.querySelectorAll("article");
            return Array.from(articles).map((article) => article.innerText);
        });
    }

    // Infinite scroll loop.
    while (true) {
        const tweets: string[] = await extractTweets();

        // Add unique tweets to the batch.
        for (const tweetText of tweets) {
            if (!tweetSet.has(tweetText)) {
                tweetSet.add(tweetText);
                tweetsBatch.push({ text: tweetText });

                if (tweetsBatch.length >= 100) {
                    writeBatchToFile(tweetsBatch);
                    tweetsBatch = [];
                }
            }
        }

        // Scroll down the page by one viewport height.
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });

        // Wait for new tweets to load.
        await page.waitForTimeout(3000);
    }

    // When you're done, you could disconnect:
    // await browser.disconnect();
})();
