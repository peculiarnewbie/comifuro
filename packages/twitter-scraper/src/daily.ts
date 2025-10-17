import { ElementHandle, Page, Browser } from "puppeteer";
import { join, dirname } from "node:path";
import sharp from "sharp";
import { ensureDir } from "./lib/ensure-dir";
import { downloadImage } from "./lib/browser";
import { getDistDir } from "./main";
import { fileURLToPath } from "node:url";
import { getBunSqlite } from "@comifuro/core/bunSqlite";
import type { TweetData } from "./lib/types";
import { tweetsOperations } from "@comifuro/core";
import { DateTime } from "luxon";
import { readdirSync } from "node:fs";

const dbUrl = new URL("../tweets.sqlite", import.meta.url);
const bunSqlitePath = fileURLToPath(dbUrl);
const bunSqlite = getBunSqlite(bunSqlitePath);

export const getTweetIdFromUrl = (url: string): string => {
    const match = url.match(/status\/(\d+)/);
    return match ? (match[1] ? match[1] : "") : "";
};

export const downloadImagesFromTweet = async (
    page: Page,
    initialTweetId: string,
    articleDir: string
) => {
    let imageIndex = 0;

    const downloadDir = process.env.DOWNLOADS_DIR;
    const twitterImagePath = `${downloadDir}twitter-image.jpg`;

    while (true) {
        let imageFile = Bun.file(twitterImagePath);
        if (await imageFile.exists()) {
            while (true) {
                try {
                    await imageFile.delete();
                } catch (e) {
                    console.log("error deleting", e);
                    await Bun.sleep(1000);
                    continue;
                }
                break;
            }
        }

        await Bun.sleep(2500); // wait for image to load

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
        } else {
            console.log("no carousel");
            image = await page.$(`[aria-label="Image"] img`);
        }

        if (!image) {
            console.error("navigation to image failed");
            break;
        }

        await downloadImage(image);
        let limit = 4;
        let i = 0;
        await Bun.sleep(500);
        imageFile = Bun.file(twitterImagePath);
        while (!(await imageFile.exists()) && i < limit) {
            imageFile = Bun.file(twitterImagePath);
            await Bun.sleep(1000);
            i++;
        }

        const jpgPath = `${articleDir}/image-${imageIndex}.jpg`;
        const webpPath = `${articleDir}/image-${imageIndex}.webp`;

        await Bun.write(jpgPath, imageFile);

        const webpRes = await processImageAsync(
            await imageFile.arrayBuffer(),
            webpPath
        );

        console.log("conversion res", webpRes);
        if (webpRes) {
            try {
                console.log("pushing image index", imageIndex);
                await Bun.file(jpgPath).delete();
            } catch (e) {
                console.log("Error deleting JPG after conversion:", e);
            }
        }

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

    const images = readdirSync(articleDir)
        .filter((f) => f.startsWith("image-"))
        .map((f) => parseInt(f.replace("image-", "")));
    return images;
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

const initTweetDir = async (tweet: TweetData) => {
    const distDir = getDistDir();
    const articleDir = join(distDir, tweet.id);
    await ensureDir(articleDir);

    await Bun.write(`${articleDir}/tweet.json`, JSON.stringify(tweet, null, 4));

    return articleDir;
};

const clickFirstImageOfTweet = async (
    tweetPage: Page,
    currentTweetId: string | null
) => {
    await tweetPage.evaluate((targetTweetId) => {
        if (!targetTweetId) return;
        const images =
            document.querySelectorAll<HTMLAnchorElement>('a[href*="photo/1"]');
        const arr = Array.from(images);
        for (const image of Array.from(images)) {
            if (image.href.includes(targetTweetId)) {
                image.click();
            }
        }

        // for (const image of Array.from(images)) {
        //     // Walk up the DOM to find the parent anchor tag
        //     let element = image.parentElement;
        //     while (element && element.tagName !== "A") {
        //         element = element.parentElement;
        //     }

        //     if (element && element.tagName === "A") {
        //         const href = element.getAttribute("href");
        //         if (href) {
        //             const match = href.match(/status\/(\d+)/);
        //             const tweetId = match ? match[1] : null;

        //             if (tweetId === targetTweetId) {
        //                 image.click();
        //                 return;
        //             }
        //         }
        //     }
        // }
    }, currentTweetId);
};

const insertTweetToDb = async (tweet: TweetData, images: number[]) => {
    const dt = DateTime.fromISO(tweet.time);
    const timestamp = dt.toJSDate();

    if (images.length === 0) {
        console.log("no images found, skipping");
        return;
    }

    let mask = 0;
    for (let i = 0; i < images.length; i++) {
        const val = images[i];
        if (val !== undefined) mask |= 1 << val;
    }

    await tweetsOperations.upsertTweet(bunSqlite, {
        id: tweet.id,
        user: tweet.user,
        timestamp,
        text: tweet.text,
        imageMask: mask,
    });
};

export const processArticles = async (
    browser: Browser,
    articles: ElementHandle<HTMLElement>[],
    maxRetries: number = 3,
    timeLimit?: number
) => {
    let currentArticle = articles ? articles[0] : null;

    for (let i = 0; i < articles.length; i++) {
        console.log("processing article", i);
        currentArticle = articles[i];
        // TODO:  gotta check if the image is inside a quote and skip
        if (currentArticle) {
            let firstImage = await currentArticle.$(`a[href*="photo"]`);

            if (!firstImage) {
                console.log(i, "no image, skipping");
                continue;
            }

            let quote = await currentArticle.$$(`time`);
            if (quote.length > 1) {
                console.log(i, "is a quote tweet, skipping");
                continue;
            }

            await Bun.sleep(5000); // 429 lol

            const { userData, tweetText, url } =
                await getArticleData(currentArticle);
            const tweetId = getTweetIdFromUrl(url);

            if ("error" in userData || "error" in tweetText) continue;

            const tweetData = {
                user: userData.username,
                time: userData.time,
                text: tweetText.text,
                id: tweetId,
            } as TweetData;

            if (timeLimit) {
                const dt = DateTime.fromISO(tweetData.time).toMillis();
                if (dt < timeLimit) {
                    console.log(
                        tweetData.time,
                        "tweet is older than limit, stopping",
                        dt
                    );
                    return { currentArticle, shouldStop: true };
                }
            } else {
                const tweetFromDb = await tweetsOperations.getTweet(
                    bunSqlite,
                    tweetData.id
                );

                // re-process if no image yet
                if (tweetFromDb && tweetFromDb.imageMask) {
                    console.log(
                        `Tweet ${tweetData.id} already processed, stopping"`
                    );
                    return { currentArticle, shouldStop: true };
                }
            }

            if (tweetText.text.toLowerCase().includes("wtb")) {
                console.log("skipping wtb tweet");
                continue;
            }

            const articleDir = await initTweetDir(tweetData);

            let retryCount = 0;
            let success = false;

            while (!success) {
                try {
                    const tweetPage = await browser.newPage();
                    await tweetPage.goto(url);
                    await Bun.sleep(2000);
                    await tweetPage.setViewport({
                        width: 1000,
                        height: 1000,
                        deviceScaleFactor: 1,
                    });
                    await Bun.sleep(1000);

                    await clickFirstImageOfTweet(tweetPage, tweetData.id);

                    await Bun.sleep(2000);

                    const images = await downloadImagesFromTweet(
                        tweetPage,
                        tweetData.id,
                        articleDir
                    );

                    await tweetPage.close();
                    success = true;

                    insertTweetToDb(tweetData, images);
                    console.log(`Successfully processed tweet: ${url}`);
                } catch (e) {
                    retryCount++;
                    console.error(
                        `Error processing tweet (attempt ${retryCount}/${maxRetries}):`,
                        e
                    );

                    if (retryCount >= maxRetries) {
                        await Bun.write(
                            `${articleDir}/error.json`,
                            JSON.stringify(
                                { error: e, retries: retryCount },
                                null,
                                4
                            )
                        );
                        break;
                    } else {
                        await Bun.sleep(2000);
                    }
                }
            }
        }
    }

    return { currentArticle, shouldStop: false };
};
