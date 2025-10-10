import { exists } from "node:fs/promises";
import { join, dirname } from "path";
import { ensureDir } from "./lib/ensure-dir";
import {
    loadProcessedTweets,
    saveProcessedTweets,
} from "./lib/deprecate/processed-tweets";
import { crawlPage, getBrowserInstance, openLatestTweets } from "./lib/browser";
import { DateTime } from "luxon";

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

const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
const distDir = `${await findProjectRoot()}/dist/`;
export const getDistDir = () => distDir;

async function main() {
    const maxRetries = parseInt(process.env.MAX_RETRIES ?? "3");

    await ensureDir(distDir);

    const browser = await getBrowserInstance();

    // const page = await openLatestTweets(browser, "cf21");
    const page = (await browser.pages())[0];
    if (!page) {
        console.error("no browser page");
        process.abort();
    }

    await Bun.sleep(5000);

    const arg = Bun.argv[2];

    console.log("start crawling until", arg);
    await crawlPage(
        browser,
        page,
        maxRetries,
        arg ? DateTime.fromISO(arg).toMillis() : undefined
    );

    console.log("done");
    return;
}

if (import.meta.main) {
    main();
}
