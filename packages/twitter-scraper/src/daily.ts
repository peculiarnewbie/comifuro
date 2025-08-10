import { ElementHandle, Page, Browser } from "puppeteer";
import { mkdir, exists, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import sharp from "sharp";

export const findProjectRoot = async (
    startDir: string = process.cwd()
): Promise<string | null> => {
    let currentDir = startDir;

    while (true) {
        if (
            (await exists(join(currentDir, "package.json"))) ||
            (await exists(join(currentDir, ".git")))
        ) {
            return currentDir.replaceAll("\\", "/");
        }

        const parentDir = dirname(currentDir);

        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
};

export const sleep = async (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

export const getTweetIdFromUrl = (url: string): string => {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] ? match[1] : "" : "";
};

export const downloadImagesFromTweet = async (
    page: Page,
    initialTweetId: string,
    articleDir: string,
    downloadDir: string
) => {
    let imageIndex = 0;

    while (true) {
        const twitterImagePath = `${downloadDir}twitter-image.jpg`;
        let imageFile = Bun.file(twitterImagePath);
        if (await imageFile.exists()) {
            while (true) {
                try {
                    await imageFile.delete();
                } catch (e) {
                    console.log("error deleting", e);
                    await sleep(1000);
                    continue;
                }
                break;
            }
        }

        await sleep(2500);

        const currentTweetId = getTweetIdFromUrl(page.url());
        if (currentTweetId !== initialTweetId) {
            console.log("Tweet navigation detected, stopping image download");
            break;
        }

        const carousel = await page.$(`[aria-roledescription="carousel"]`);

        let image: undefined | ElementHandle<HTMLElement> | null;
        if (carousel) {
            const list = await carousel.$$("ul li");
            image = await list[imageIndex]?.$("img");
            const isPlaceholder = await image?.evaluate((node) => {
                return node.getAttribute("alt") === "placeholder";
            });
            if (isPlaceholder) {
                imageIndex++;
                continue;
            }
        } else image = await page.$(`[aria-label="Image"] img`);

        if (!image) break;

        await downloadImage(image);
        let limit = 4;
        let i = 0;
        await sleep(500);
        imageFile = Bun.file(twitterImagePath);
        while (!(await imageFile.exists()) && i < limit) {
            imageFile = Bun.file(twitterImagePath);
            await sleep(1000);
            i++;
        }

        const jpgPath = `${articleDir}/image-${imageIndex}.jpg`;
        const webpPath = `${articleDir}/image-${imageIndex}.webp`;

        await Bun.write(jpgPath, imageFile);

        processImageAsync(await imageFile.arrayBuffer(), webpPath).then(async (success) => {
            if (success) {
                try {
                    await Bun.file(jpgPath).delete();
                } catch (e) {
                    console.log("Error deleting JPG after conversion:", e);
                }
            }
        });

        const nextButton = await page.$(`[data-testid="Carousel-NavRight"]`);
        if (!nextButton) {
            console.log("No more images (next button not found)");
            break;
        }

        try {
            await nextButton.click();
            imageIndex++;
        } catch (e) {
            console.log("Error clicking next button or no more images");
            break;
        }
    }
};

export const ensureDir = async (dir: string) => {
    try {
        await access(dir);
    } catch {
        try {
            await mkdir(dir, { recursive: true });
            console.log(`Directory created`, dir);
        } catch {
            return "";
        }
    }
};

export const getCurrentArticlesOnPage = async (page: Page) => {
    const timeline = await page.$("[aria-label='Timeline: Search timeline']");
    const articles = await timeline?.$$(`article[tabindex="0"]`);
    return articles;
};

export const getArticleData = async (article: ElementHandle<HTMLElement>) => {
    let userData: { username: string; time: string } | { error: Error };
    try {
        userData = (await article.$eval(
            `[data-testid="User-Name"]`,
            (el: Element) => {
                try {
                    const part = el.lastChild as HTMLElement;
                    const username = part.querySelector("span")?.textContent;
                    const time = part.querySelector("time")?.dateTime;
                    return { username, time };
                } catch (e) {
                    return { error: e };
                }
            }
        )) as { username: string; time: string } | { error: Error };
    } catch (e) {
        userData = { error: e as Error };
    }

    const tweetText = (await article.$eval(
        `[data-testid="tweetText"]`,
        (el: Element) => {
            try {
                return { text: el.textContent };
            } catch (e) {
                return { error: e };
            }
        }
    )) as { text: string } | { error: Error };

    const links = await article.$$eval("a", (links) => {
        try {
            return links.map((link) => link.href);
        } catch (e) {
            return null;
        }
    });
    const url = links?.find((link) => link.includes("/status/")) ?? "";

    return { userData, tweetText, url };
};

export const loadProcessedTweets = async (distDir: string): Promise<Set<string>> => {
    const stateFile = join(distDir, "processed_tweets.json");
    try {
        const data = await Bun.file(stateFile).json();
        return new Set(data);
    } catch {
        return new Set();
    }
};

export const saveProcessedTweets = async (distDir: string, processedTweets: Set<string>) => {
    const stateFile = join(distDir, "processed_tweets.json");
    await Bun.write(stateFile, JSON.stringify([...processedTweets], null, 2));
};

const processImageAsync = async (input: ArrayBuffer, target: string) => {
    try {
        await sharp(input)
            .resize({ width: 1080, height: 1080, fit: "inside" })
            .webp({ quality: 80 })
            .toFile(target);
        return true;
    } catch (e) {
        console.error("Image processing error:", e);
    }
    return false;
};

const initTweetDir = async (index: number, distDir: string, userData: { username: string, time: string }, text: string, url: string) => {
    const articleDir = join(distDir, `twitter-article-${index}`);
    await ensureDir(articleDir);

    await Bun.write(
        `${articleDir}/tweet.json`,
        JSON.stringify(
            {
                user: userData.username,
                time: userData.time,
                text: text,
                url: url,
            },
            null,
            4
        )
    );

    return articleDir;
}

const clickFirstImageOfTweet = async (tweetPage: Page, currentTweetId: string | null) => {
    await tweetPage.evaluate((targetTweetId) => {
        const images = document.querySelectorAll('[aria-label="Image"]');

        for (const image of Array.from(images)) {
            // Walk up the DOM to find the parent anchor tag
            let element = image.parentElement;
            while (element && element.tagName !== 'A') {
                element = element.parentElement;
            }

            if (element && element.tagName === 'A') {
                const href = element.getAttribute('href');
                if (href) {
                    const match = href.match(/status\/(\d+)/);
                    const tweetId = match ? match[1] : null;

                    if (tweetId === targetTweetId) {
                        element.click();
                        return;
                    }
                }
            }
        }
    }, currentTweetId);
}


export const processArticles = async (
    browser: Browser,
    articles: ElementHandle<HTMLElement>[],
    offset: number,
    distDir: string,
    downloadsDir: string,
    processedTweets: Set<string>,
    maxRetries: number = 3,
) => {
    let currentArticle = articles ? articles[0] : null;

    for (let i = 0; i < articles.length; i++) {
        console.log("processing article", i);
        currentArticle = articles[i];
        if (currentArticle) {
            let firstImage = await currentArticle.$(`[aria-label="Image"]`);

            if (!firstImage) continue;

            const { userData, tweetText, url } = await getArticleData(
                currentArticle
            );

            if ("error" in userData || "error" in tweetText) continue;

            if (processedTweets.has(url)) {
                console.log("Tweet already processed, stopping");
                return { currentArticle, index: i, shouldStop: true };
            }

            if (tweetText.text.toLowerCase().includes("wtb")) {
                console.log("skipping wtb tweet")
                continue;
            }

            const articleDir = await initTweetDir(i + offset, distDir, userData, tweetText.text, url);

            let retryCount = 0;
            let success = false;

            while (!success) {
                try {
                    const tweetPage = await browser.newPage();
                    await tweetPage.goto(url);
                    await sleep(2000);
                    await tweetPage.setViewport({
                        width: 1920,
                        height: 1000,
                        deviceScaleFactor: 1,
                    });
                    await sleep(1000);

                    const currentTweetId = getTweetIdFromUrl(url);
                    await clickFirstImageOfTweet(tweetPage, currentTweetId);

                    await sleep(2000);

                    await downloadImagesFromTweet(tweetPage, currentTweetId, articleDir, downloadsDir);

                    await tweetPage.close();
                    success = true;

                    processedTweets.add(url);
                    console.log(`Successfully processed tweet: ${url}`);


                } catch (e) {
                    retryCount++;
                    console.error(`Error processing tweet (attempt ${retryCount}/${maxRetries}):`, e);

                    if (retryCount >= maxRetries) {
                        await Bun.write(
                            `${articleDir}/error.json`,
                            JSON.stringify({ error: e, retries: retryCount }, null, 4)
                        );
                        break;
                    } else {
                        await sleep(2000);
                    }
                }
            }
        }
    }

    return { currentArticle, index: articles.length - 1, shouldStop: false };
};
