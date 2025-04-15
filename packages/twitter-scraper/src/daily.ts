import puppeteer, { Browser, Page } from "puppeteer";
import { mkdir, exists, access } from "node:fs/promises";

const sleep = async (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const downloadImage = async (page: Page) => {
    const image = await page.$(`[aria-roledescription="carousel"] img`);
    await image?.evaluate(async (node) => {
        const imgSrc = node.getAttribute("src");
        const document = node.ownerDocument;
        const response = await fetch(imgSrc, { mode: "cors" });
        const blob = await response.blob();
        //@ts-expect-error
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

const downloadDir = "D:/Ryzen/Downloads";
const distDir = "C:/Users/Ryzen/git/web/comifuro/packages/twitter-scraper/dist";

const checkDistDir = async () => {
    try {
        await access(distDir);
    } catch {
        try {
            await mkdir(distDir, { recursive: true });
            console.log(`Directory created`);
        } catch {
            return "";
        }
    }
};

const main = async () => {
    await checkDistDir();

    const browserWs = await fetch("http://localhost:9222/json/version");
    //@ts-expect-error
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

    const article = page.locator("article");
    await article.click();

    let i = 0;

    while (true) {
        let imageFile = Bun.file(`${downloadDir}/twitter-image.jpg`);
        if (await imageFile.exists()) {
            await imageFile.delete();
        }

        await sleep(2500);

        await downloadImage(page);
        console.log("downloaded");
        await sleep(500);
        imageFile = Bun.file(`${downloadDir}/twitter-image.jpg`);
        console.log(imageFile, await imageFile.exists());
        await Bun.write(`${distDir}/twitter-image-${i}.jpg`, imageFile);

        try {
            await page.$eval(`[data-testid="Carousel-NavRight"]`, (el) => {
                if (el) el.click();
            });
            i++;
        } catch (e) {
            console.log("no more images");
            break;
        }
    }

    await sleep(1000);

    console.log("closing");

    const close = page.locator(`[aria-label="Close"]`);
    await close.click();

    process.abort();
};

main();
