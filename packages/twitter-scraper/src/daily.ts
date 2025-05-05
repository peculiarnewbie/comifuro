import { ElementHandle, Page } from "puppeteer";
import { mkdir, exists, access } from "node:fs/promises";
import { join, dirname } from "node:path";

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

export const downloadImagesFromTweet = async (
    page: Page,
    articleDir: string,
    downloadDir: string
) => {
    let imageIndex = 0;

    while (true) {
        const twitterImagePath = `${downloadDir}twitter-image.jpg`;
        console.log(twitterImagePath);
        let imageFile = Bun.file(twitterImagePath);
        if (await imageFile.exists()) {
            console.log("deleting", imageFile);
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

        const carousel = await page.$(`[aria-roledescription="carousel"]`);

        let image: undefined | ElementHandle<HTMLElement> | null;
        if (carousel) {
            const list = await carousel.$$("ul li");
            image = await list[imageIndex]?.$("img");
        } else image = await page.$(`[aria-label="Image"] img`);

        if (!image) break;

        await downloadImage(image);
        //wait for download
        let limit = 4;
        let i = 0;
        await sleep(500);
        imageFile = Bun.file(twitterImagePath);
        while (!(await imageFile.exists()) && i < limit) {
            imageFile = Bun.file(twitterImagePath);
            await sleep(1000);
            i++;
        }
        console.log("downloaded", imageFile, await imageFile.exists());
        await Bun.write(`${articleDir}/image-${imageIndex}.jpg`, imageFile);

        try {
            await page.$eval(`[data-testid="Carousel-NavRight"]`, (el) => {
                //@ts-expect-error
                if (el) el.click();
            });
            imageIndex++;
        } catch (e) {
            console.log("no more images");
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
            console.log(`Directory created`);
        } catch {
            return "";
        }
    }
};

export const getCurrentArticlesOnPage = async (page: Page) => {
    const timeline = await page.$("[aria-label='Timeline: Search timeline']");
    const articlesContainer = await timeline?.$("div");
    const articles = await articlesContainer?.$$("article");
    return articles;
};

export const getArticlesData = async (article: ElementHandle<HTMLElement>) => {
    const userData = (await article.$eval(
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

    return { userData, tweetText };
};

export const processArticles = async (
    page: Page,
    articles: ElementHandle<HTMLElement>[],
    offset: number,
    distDir: string,
    downloadsDir: string
) => {
    let currentArticle = articles ? articles[0] : null;

    for (let i = 0; i < articles.length; i++) {
        console.log("clicking article", i);
        currentArticle = articles[i];
        if (currentArticle) {
            const firstImage = await currentArticle.$(`[aria-label="Image"]`);

            const { userData, tweetText } = await getArticlesData(
                currentArticle
            );

            if (!firstImage || "error" in userData || "error" in tweetText)
                continue;

            if (tweetText.text.toLowerCase().includes("wtb")) continue;

            const articleDir = join(distDir, `twitter-article-${i + offset}`);
            await ensureDir(articleDir);

            await Bun.write(
                `${articleDir}/tweet.json`,
                JSON.stringify(
                    {
                        user: userData.username,
                        time: userData.time,
                        text: tweetText.text,
                        url: page.url()
                    },
                    null,
                    4
                )
            );

            try {
                firstImage.click();
            } catch (e) {
                console.error("error clicking image", e);
                await Bun.write(
                    `${articleDir}/error.json`,
                    JSON.stringify(e, null, 4)
                );
                continue;
            }

            await sleep(1000);

            await downloadImagesFromTweet(page, articleDir, downloadsDir);

            await sleep(1000);

            console.log("closing article", i);

            // const close = page.locator(`[aria-label="Close"]`);
            // await close.click();
            await page.goBack();
            await sleep(2000);
        }
    }

    return { currentArticle, index: articles.length - 1 };
};
