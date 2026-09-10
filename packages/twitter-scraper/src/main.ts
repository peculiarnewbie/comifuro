import { startTelemetry, withSpan } from "./telemetry";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { ApiClient } from "./api-client";
import { connectBrowser, ensureBrowserAvailable, findExistingPage } from "./browser";
import { currentDir, loadConfig, loadEnvFiles } from "./config";
import { ensureOpencodeServer } from "./opencode-manager";
import { createClassifier } from "./opencode";
import { browserSearchSource, runSearch, tweetProcessor } from "./pipeline/search-modes";
import { RunStore } from "./run-store";
import { Runtime } from "./runtime";

export async function main() {
    loadEnvFiles();
    if (process.argv.slice(2).includes("--status")) {
        const store = new RunStore(
            process.env.SCRAPER_RUN_DB ?? resolve(currentDir, "../.scraper/runs.sqlite"),
        );
        try {
            console.log(JSON.stringify(store.status(), null, 2));
        } finally {
            store.close();
        }
        return;
    }
    const config = loadConfig();
    const store = new RunStore(config.runDbPath);
    const telemetry = startTelemetry();
    const controller = new AbortController();
    const runtime = new Runtime(controller.signal, (until) => store.recordCooldown(until));
    let browser: Browser | null = null;
    let stopOpencode: (() => void) | undefined;
    const onSignal = (signal: NodeJS.Signals) => {
        process.exitCode = signal === "SIGINT" ? 130 : 143;
        controller.abort(new Error(signal));
        // Break outstanding Playwright calls without closing the user's browser process.
        void browser?.close().catch(() => {});
    };
    const onInt = () => onSignal("SIGINT");
    const onTerm = () => onSignal("SIGTERM");
    process.once("SIGINT", onInt);
    process.once("SIGTERM", onTerm);
    try {
        store.acquire();
        await runtime.wait(Math.max(0, store.cooldownDeadline() - Date.now()));
        const managedOpencode = await ensureOpencodeServer(config, controller.signal);
        stopOpencode = managedOpencode.stop;
        controller.signal.throwIfAborted();
        await ensureBrowserAvailable(config);
        browser = await connectBrowser(config);
        controller.signal.throwIfAborted();
        const apiClient = new ApiClient({
            apiBaseUrl: config.apiBaseUrl,
            apiPassword: config.apiPassword,
            runtime,
        });
        const classifier = await createClassifier(config, runtime);
        const page = await findExistingPage(browser, config);
        const result = await withSpan(
            "scraper.run",
            { "scraper.mode": config.runMode, "scraper.event": config.eventId },
            () =>
                runSearch({
                    config,
                    store,
                    apiClient,
                    source: browserSearchSource(page, config),
                    processTweet: tweetProcessor({ apiClient, classifier, page, config }),
                    signal: controller.signal,
                    promptVersion: classifier.fingerprint,
                    runtime,
                }),
        );
        if (result.status === "paused") process.exitCode = 2;
    } finally {
        await browser?.close().catch(() => {});
        stopOpencode?.();
        store.close();
        await telemetry?.shutdown();
        process.removeListener("SIGINT", onInt);
        process.removeListener("SIGTERM", onTerm);
    }
}

// tsx runs on Node, where import.meta.main is not available on all supported versions.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode ??= 1;
    });
}
