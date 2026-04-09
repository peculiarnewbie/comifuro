import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ScraperConfig } from "./types";

const currentDir = dirname(fileURLToPath(import.meta.url));

const envSchema = z.object({
    API_BASE_URL: z.string().url().default("https://api.cf.peculiarnewbie.com"),
    API_PASSWORD: z
        .string()
        .min(1)
        .optional()
        .catch(undefined)
        .transform((value) => value ?? process.env.PEC_PASSWORD ?? process.env.PASSWORD),
    EVENT_ID: z.string().min(1).default("cf22"),
    SCRAPER_STATE_ID: z.string().min(1).default("x-search:cf22"),
    SEARCH_QUERY: z
        .string()
        .min(1)
        .default("(#comifuro22catalogue OR #cf22) filter:images"),
    STAGEHAND_CDP_URL: z.string().min(1).default("http://127.0.0.1:9222"),
    SCRAPER_BROWSER_COMMAND: z.string().min(1).optional(),
    SCRAPER_PAGE_URL_MATCH: z.string().min(1).default("https://x.com/"),
    SCRAPER_SCROLL_DELAY_MS: z.coerce.number().int().positive().default(3000),
    SCRAPER_IDLE_SCROLL_LIMIT: z.coerce.number().int().positive().default(4),
    OPENCODE_BASE_URL: z.string().url().default("http://127.0.0.1:4097"),
    OPENCODE_MANAGED: z
        .union([z.literal("true"), z.literal("false")])
        .optional()
        .transform((value) => value !== "false"),
    OPENCODE_BIN: z.string().min(1).default("opencode"),
    OPENCODE_PROVIDER_ID: z.string().min(1).optional(),
    OPENCODE_MODEL_ID: z.string().min(1).optional(),
    OPENCODE_SERVER_USERNAME: z.string().min(1).optional(),
    OPENCODE_SERVER_PASSWORD: z.string().min(1).optional(),
    CLASSIFIER_PROMPT_PATH: z
        .string()
        .min(1)
        .default(
            resolve(currentDir, "../prompts/catalogue-classifier.md"),
        ),
});

export function loadConfig(): ScraperConfig {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "invalid scraper config");
    }

    if (!parsed.data.API_PASSWORD) {
        throw new Error("API_PASSWORD or PEC_PASSWORD is required");
    }

    return {
        apiBaseUrl: parsed.data.API_BASE_URL,
        apiPassword: parsed.data.API_PASSWORD,
        eventId: parsed.data.EVENT_ID.trim().toLowerCase(),
        stateId: parsed.data.SCRAPER_STATE_ID,
        searchQuery: parsed.data.SEARCH_QUERY,
        stagehandCdpUrl: parsed.data.STAGEHAND_CDP_URL,
        scraperBrowserCommand: parsed.data.SCRAPER_BROWSER_COMMAND,
        scraperPageUrlMatch: parsed.data.SCRAPER_PAGE_URL_MATCH,
        scrollDelayMs: parsed.data.SCRAPER_SCROLL_DELAY_MS,
        idleScrollLimit: parsed.data.SCRAPER_IDLE_SCROLL_LIMIT,
        opencodeBaseUrl: parsed.data.OPENCODE_BASE_URL,
        opencodeManaged: parsed.data.OPENCODE_MANAGED ?? true,
        opencodeBin: parsed.data.OPENCODE_BIN,
        opencodeProviderId: parsed.data.OPENCODE_PROVIDER_ID,
        opencodeModelId: parsed.data.OPENCODE_MODEL_ID,
        opencodeUsername: parsed.data.OPENCODE_SERVER_USERNAME,
        opencodePassword: parsed.data.OPENCODE_SERVER_PASSWORD,
        classifierPromptPath: parsed.data.CLASSIFIER_PROMPT_PATH,
    };
}
