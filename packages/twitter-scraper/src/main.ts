import type { Browser } from "playwright";
import { ApiClient } from "./api-client";
import { connectBrowser, ensureBrowserAvailable, findExistingPage } from "./browser";
import { buildSearchQuery } from "./cli";
import { loadConfig } from "./config";
import { ensureOpencodeServer } from "./opencode-manager";
import { createClassifier } from "./opencode";
import { runDefaultSearch, runMaxIdSearch } from "./pipeline/search-modes";

async function run(browser: Browser, config = loadConfig()) {
    const apiClient = new ApiClient({
        apiBaseUrl: config.apiBaseUrl,
        apiPassword: config.apiPassword,
    });
    const classifier = await createClassifier(config);
    const page = await findExistingPage(browser, config);
    const persistedSearchQuery = buildSearchQuery(config.searchQuery, {
        since: config.searchSinceDate,
    });

    console.log(`using page ${page.url() || "[blank]"}`);

    if (config.runMode === "max-id") {
        await runMaxIdSearch({
            apiClient,
            classifier,
            page,
            config,
            persistedSearchQuery,
        });
        return;
    }

    await runDefaultSearch({
        apiClient,
        classifier,
        page,
        config,
        persistedSearchQuery,
    });
}

let browser: Browser | null = null;
let stopManagedOpencode: (() => void) | null = null;
let cleanupRegistered = false;

function registerCleanup() {
    if (cleanupRegistered) {
        return;
    }

    cleanupRegistered = true;
    const cleanup = () => {
        stopManagedOpencode?.();
        stopManagedOpencode = null;
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
        cleanup();
        process.exit(130);
    });
    process.on("SIGTERM", () => {
        cleanup();
        process.exit(143);
    });
}

async function main() {
    const config = loadConfig();
    registerCleanup();

    try {
        const managedOpencode = await ensureOpencodeServer(config);
        stopManagedOpencode = managedOpencode.stop;
        await ensureBrowserAvailable(config);
        browser = await connectBrowser(config);
        await run(browser, config);
        process.exit(0);
    } finally {
        stopManagedOpencode?.();
        browser = null;
    }
}

if (import.meta.main) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
