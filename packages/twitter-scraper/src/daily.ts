import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { mkdir, exists, access } from "node:fs/promises";
import { join, dirname } from "node:path";

const findProjectRoot = async (
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

const sleep = async (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const downloadImage = async (image: ElementHandle<any>) => {
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

const downloadImagesFromTweet = async (page: Page, articleDir: string) => {
    let imageIndex = 0;

    while (true) {
        let imageFile = Bun.file(`${downloadDir}twitter-image.jpg`);
        if (await imageFile.exists()) {
            await imageFile.delete();
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
        while (!(await imageFile.exists()) && i < limit) {
            await sleep(1000);
            i++;
        }
        imageFile = Bun.file(`${downloadDir}twitter-image.jpg`);
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

const downloadDir = process.env.DOWNLOADS_DIR;
const distDir = `${await findProjectRoot()}/dist/`;

const ensureDir = async (dir: string) => {
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

const getCurrentArticlesOnPage = async (page: Page) => {
    const timeline = await page.$("[aria-label='Timeline: Search timeline']");
    const articlesContainer = await timeline?.$("div");
    const articles = await articlesContainer?.$$("article");
    return articles;
};

const getArticlesData = async (article: ElementHandle<HTMLElement>) => {
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

const processArticles = async (
    page: Page,
    articles: ElementHandle<HTMLElement>[],
    offset: number
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
                    },
                    null,
                    4
                )
            );

            firstImage.click();

            await sleep(1000);

            await downloadImagesFromTweet(page, articleDir);

            await sleep(1000);

            console.log("closing article", i);

            const close = page.locator(`[aria-label="Close"]`);
            await close.click();
        }
    }

    return { currentArticle, index: articles.length - 1 };
};

const main = async () => {
    await ensureDir(distDir);

    const browserWs = await fetch("http://localhost:9222/json/version");
    const browserEndpoint = (await browserWs.json()).webSocketDebuggerUrl;
    const browser = await puppeteer.connect({
        browserWSEndpoint: browserEndpoint,
    });

    const [page, _] = await browser.pages();
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
            offset
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

    process.exit(0);
};

main();
