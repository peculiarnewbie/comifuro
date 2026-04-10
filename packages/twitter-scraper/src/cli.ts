import { z } from "zod";

const cliArgsSchema = z.object({
    mode: z.enum(["default", "max-id"]).default("default"),
    maxId: z.string().regex(/^\d+$/).optional(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    updateState: z.boolean().optional(),
    maxPages: z.coerce.number().int().positive().optional(),
});

export type ScraperCliArgs = z.infer<typeof cliArgsSchema>;

function readFlagValue(argv: string[], index: number, name: string) {
    const current = argv[index];
    if (typeof current !== "string") {
        throw new Error(`missing argument at index ${index}`);
    }

    const dashedName = `--${name}`;
    const underscoredName = `--${name.replace(/-/g, "_")}`;

    for (const candidate of [dashedName, underscoredName]) {
        if (current === candidate) {
            const nextValue = argv[index + 1];
            if (!nextValue || nextValue.startsWith("--")) {
                throw new Error(`missing value for ${candidate}`);
            }

            return {
                value: nextValue,
                consumed: 2,
            };
        }

        if (current.startsWith(`${candidate}=`) || current.startsWith(`${candidate}:`)) {
            return {
                value: current.slice(candidate.length + 1),
                consumed: 1,
            };
        }
    }

    return null;
}

export function parseScraperCliArgs(argv: string[]) {
    const rawArgs: Record<string, unknown> = {};

    for (let index = 0; index < argv.length; ) {
        const current = argv[index];
        if (typeof current !== "string") {
            throw new Error(`missing argument at index ${index}`);
        }

        if (!current.startsWith("--")) {
            throw new Error(`unknown positional argument: ${current}`);
        }

        if (current === "--update-state") {
            rawArgs.updateState = true;
            index += 1;
            continue;
        }

        if (current === "--no-update-state") {
            rawArgs.updateState = false;
            index += 1;
            continue;
        }

        const mode = readFlagValue(argv, index, "mode");
        if (mode) {
            rawArgs.mode = mode.value;
            index += mode.consumed;
            continue;
        }

        const maxId = readFlagValue(argv, index, "max-id");
        if (maxId) {
            rawArgs.maxId = maxId.value;
            index += maxId.consumed;
            continue;
        }

        const since = readFlagValue(argv, index, "since");
        if (since) {
            rawArgs.since = since.value;
            index += since.consumed;
            continue;
        }

        const maxPages = readFlagValue(argv, index, "max-pages");
        if (maxPages) {
            rawArgs.maxPages = maxPages.value;
            index += maxPages.consumed;
            continue;
        }

        throw new Error(`unknown argument: ${current}`);
    }

    const parsed = cliArgsSchema.safeParse(rawArgs);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "invalid scraper CLI args");
    }

    return parsed.data;
}

export function buildSearchQuery(
    baseQuery: string,
    options?: {
        maxId?: string | null;
        since?: string | null;
    },
) {
    const parts = [baseQuery.trim()];

    if (options?.since) {
        parts.push(`since:${options.since}`);
    }

    if (options?.maxId) {
        parts.push(`max_id:${options.maxId}`);
    }

    return parts.join(" ").trim();
}
