import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import { parseScraperCliArgs } from "./cli";
import type { ScraperConfig } from "./types";

const currentDir = dirname(fileURLToPath(import.meta.url));

let envLoaded = false;

function loadEnvFiles() {
    if (envLoaded || typeof process.loadEnvFile !== "function") {
        return;
    }

    envLoaded = true;

    for (const path of [resolve(currentDir, "../.env"), resolve(currentDir, "../../.env")]) {
        try {
            process.loadEnvFile(path);
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
                throw error;
            }
        }
    }
}

const CoerceNumber = Schema.Union([Schema.NumberFromString, Schema.Number]);

const envSchema = Schema.Struct({
    API_BASE_URL: Schema.optional(Schema.String),
    API_PASSWORD: Schema.optional(Schema.String),
    EVENT_ID: Schema.optional(Schema.String),
    SCRAPER_STATE_ID: Schema.optional(Schema.String),
    SEARCH_QUERY: Schema.optional(Schema.String),
    BROWSER_CDP_URL: Schema.optional(Schema.String),
    STAGEHAND_CDP_URL: Schema.optional(Schema.String),
    SCRAPER_BROWSER_COMMAND: Schema.optional(Schema.String),
    SCRAPER_PAGE_URL_MATCH: Schema.optional(Schema.String),
    SCRAPER_SCROLL_DELAY_MS: Schema.optional(CoerceNumber),
    SCRAPER_IDLE_SCROLL_LIMIT: Schema.optional(CoerceNumber),
    SCRAPER_MAX_ID_RELOAD_LIMIT: Schema.optional(CoerceNumber),
    THREAD_SCROLL_DELAY_MS: Schema.optional(CoerceNumber),
    THREAD_IDLE_SCROLL_LIMIT: Schema.optional(CoerceNumber),
    OPENCODE_BASE_URL: Schema.optional(Schema.String),
    OPENCODE_MANAGED: Schema.optional(Schema.Literals(["true", "false"] as const)),
    OPENCODE_BIN: Schema.optional(Schema.String),
    OPENCODE_PROVIDER_ID: Schema.optional(Schema.String),
    OPENCODE_MODEL_ID: Schema.optional(Schema.String),
    OPENCODE_SERVER_USERNAME: Schema.optional(Schema.String),
    OPENCODE_SERVER_PASSWORD: Schema.optional(Schema.String),
    CLASSIFIER_PROMPT_PATH: Schema.optional(Schema.String),
});

function toInt(value: string | number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (typeof value === "number") return Math.round(value);
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function str(value: string | undefined, fallback: string): string {
    return value ?? fallback;
}

export function loadConfig(argv = process.argv.slice(2)): ScraperConfig {
    loadEnvFiles();

    let env: Schema.Schema.Type<typeof envSchema>;
    try {
        env = Schema.decodeUnknownSync(envSchema)(process.env);
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "invalid scraper config");
    }

    const apiPassword = env.API_PASSWORD ?? process.env.PEC_PASSWORD ?? process.env.PASSWORD;
    if (!apiPassword) {
        throw new Error("API_PASSWORD or PEC_PASSWORD is required");
    }

    const cliArgs = parseScraperCliArgs(argv);

    return {
        apiBaseUrl: str(env.API_BASE_URL, "https://cf.peculiarnewbie.com/api"),
        apiPassword,
        eventId: str(env.EVENT_ID, "cf22").trim().toLowerCase(),
        stateId: str(env.SCRAPER_STATE_ID, "x-search:cf22"),
        searchQuery: str(env.SEARCH_QUERY, "(#comifuro22catalogue OR #cf22) filter:images"),
        browserCdpUrl: env.BROWSER_CDP_URL ?? env.STAGEHAND_CDP_URL ?? "http://127.0.0.1:9222",
        scraperBrowserCommand: env.SCRAPER_BROWSER_COMMAND,
        scraperPageUrlMatch: str(env.SCRAPER_PAGE_URL_MATCH, "https://x.com/"),
        scrollDelayMs: toInt(env.SCRAPER_SCROLL_DELAY_MS, 3000),
        idleScrollLimit: toInt(env.SCRAPER_IDLE_SCROLL_LIMIT, 4),
        threadScrollDelayMs: toInt(env.THREAD_SCROLL_DELAY_MS, 1500),
        threadIdleScrollLimit: toInt(env.THREAD_IDLE_SCROLL_LIMIT, 2),
        opencodeBaseUrl: str(env.OPENCODE_BASE_URL, "http://127.0.0.1:4097"),
        opencodeManaged: env.OPENCODE_MANAGED !== "false",
        opencodeBin: str(env.OPENCODE_BIN, "opencode"),
        opencodeProviderId: env.OPENCODE_PROVIDER_ID,
        opencodeModelId: env.OPENCODE_MODEL_ID,
        opencodeUsername: env.OPENCODE_SERVER_USERNAME,
        opencodePassword: env.OPENCODE_SERVER_PASSWORD,
        classifierPromptPath: str(
            env.CLASSIFIER_PROMPT_PATH,
            resolve(currentDir, "../prompts/catalogue-classifier.md"),
        ),
        runMode: cliArgs.mode ?? "default",
        searchMaxId: cliArgs.maxId ?? null,
        searchSinceDate: cliArgs.since ?? null,
        updateState: cliArgs.updateState ?? cliArgs.mode === "default",
        maxIdReloadPageLimit: cliArgs.maxPages ?? toInt(env.SCRAPER_MAX_ID_RELOAD_LIMIT, 100),
    };
}
