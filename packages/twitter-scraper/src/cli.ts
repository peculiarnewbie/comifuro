import * as Schema from "effect/Schema";
import { Effect } from "effect";

const cliArgsSchema = Schema.Struct({
    mode: Schema.optional(Schema.Literals(["default", "max-id"] as const)).pipe(
        Schema.withDecodingDefault(Effect.succeed("default" as const)),
    ),
    maxId: Schema.optional(Schema.String),
    since: Schema.optional(Schema.String),
    updateState: Schema.optional(Schema.Boolean),
    maxPages: Schema.optional(Schema.NumberFromString),
});

export type ScraperCliArgs = Schema.Schema.Type<typeof cliArgsSchema>;

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

    let parsed: ScraperCliArgs;
    try {
        parsed = Schema.decodeUnknownSync(cliArgsSchema)(rawArgs);
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "invalid scraper CLI args");
    }

    return parsed;
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
