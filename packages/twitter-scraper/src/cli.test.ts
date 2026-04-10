import { describe, expect, test } from "bun:test";
import { buildSearchQuery, parseScraperCliArgs } from "./cli";

describe("parseScraperCliArgs", () => {
    test("supports the dedicated max-id mode flags", () => {
        const parsed = parseScraperCliArgs([
            "--mode=max-id",
            "--max_id=2039968911693861364",
            "--since:2026-01-01",
            "--max-pages",
            "7",
            "--no-update-state",
        ]);

        expect(parsed).toEqual({
            mode: "max-id",
            maxId: "2039968911693861364",
            since: "2026-01-01",
            maxPages: 7,
            updateState: false,
        });
    });

    test("rejects unknown flags", () => {
        expect(() => parseScraperCliArgs(["--wat"])).toThrow(
            "unknown argument: --wat",
        );
    });
});

describe("buildSearchQuery", () => {
    test("appends since and max_id operators without mutating the base query", () => {
        expect(
            buildSearchQuery("(#comifuro22catalogue OR #cf22) filter:images", {
                since: "2026-01-01",
                maxId: "2039968911693861364",
            }),
        ).toBe(
            "(#comifuro22catalogue OR #cf22) filter:images since:2026-01-01 max_id:2039968911693861364",
        );
    });
});
