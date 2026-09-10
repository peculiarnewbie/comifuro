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
        expect(() => parseScraperCliArgs(["--wat"])).toThrow("unknown argument: --wat");
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

describe("CLI safety checks", () => {
    for (const value of ["", "-1", "1.5", "NaN", "Infinity", "abc"]) {
        test(`rejects invalid page limit ${value}`, () => {
            expect(() => parseScraperCliArgs([`--max-pages=${value}`])).toThrow();
        });
    }
    for (const value of ["2026-02-30", "2026-13-01", "01-01-2026", ""]) {
        test(`rejects invalid date ${value}`, () => {
            expect(() => parseScraperCliArgs([`--since=${value}`])).toThrow();
        });
    }
    test("requires decimal IDs and explicit backfill mode", () => {
        expect(() => parseScraperCliArgs(["--mode=max-id", "--max-id=1e20"])).toThrow();
        expect(() => parseScraperCliArgs(["--max-id=123"])).toThrow("requires");
        expect(() => parseScraperCliArgs(["--mode=max-id", "--update-state"])).toThrow(
            "cannot update",
        );
    });
    test("accepts the pnpm argument separator", () => {
        expect(parseScraperCliArgs(["--", "--max-pages=2"]).maxPages).toBe(2);
    });
});
