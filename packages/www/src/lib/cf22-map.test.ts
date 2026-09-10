import { describe, expect, test } from "bun:test";
import { boothByCode, circleEntries, entriesForBooth, mapBooths, searchCircles } from "./cf22-map";

describe("CF22 PDF map", () => {
    test("every directory address resolves to a unique physical box", () => {
        expect(circleEntries).toHaveLength(1477);
        expect(mapBooths).toHaveLength(2612);
        expect(boothByCode.size).toBe(mapBooths.length);
        for (const entry of circleEntries) {
            expect(entry.name.trim().length).toBeGreaterThan(0);
            expect(["both", "saturday", "sunday"]).toContain(entry.day);
            for (const code of entry.codes) expect(boothByCode.has(code)).toBe(true);
        }
    });
    test("matches known labels to the PDF's actual coordinates and half orientation", () => {
        expect(boothByCode.get("AA-01")).toMatchObject({ x: 1247.869, y: 814.448 });
        expect(boothByCode.get("B-30a")).toMatchObject({ x: 990.814, y: 414.674 });
        expect(boothByCode.get("B-31b")).toMatchObject({ x: 977.285, y: 414.674 });
        expect(entriesForBooth("B-30a")[0]?.name).toBe("Risza Perdhana");
        expect(entriesForBooth("B-31b")[0]?.name).toBe("Gajah Ngomik");
        expect(entriesForBooth("AG-33")[0]?.name).toBe("YingTze");
    });
    test("preserves shared booths and separate day assignments", () => {
        expect(entriesForBooth("AA-01")).toEqual(entriesForBooth("AA-02"));
        expect(entriesForBooth("AA-01")[0]?.name).toBe("Ichigowarano");
        expect(entriesForBooth("Z-01a")[0]?.codes).toEqual(["Z-01a", "Z-01b", "Z-02a", "Z-02b"]);
        expect(entriesForBooth("A-40a", "saturday").map((entry) => entry.name)).toEqual([
            "APHIN123",
        ]);
        expect(entriesForBooth("A-40a", "sunday").map((entry) => entry.name)).toEqual([
            "KrapirafaS",
        ]);
        expect(entriesForBooth("A-40a")).toHaveLength(2);
        expect(entriesForBooth("AA-01", "sunday")).toHaveLength(1);
    });
    test("unlisted boxes remain unassigned", () => {
        expect(boothByCode.has("S-01a")).toBe(true);
        expect(entriesForBooth("S-01a")).toEqual([]);
        expect(entriesForBooth("invalid")).toEqual([]);
    });
    test("search accepts names and loosely formatted addresses, with day filtering", () => {
        expect(searchCircles("  ichigowarano ", "all")[0]?.codes).toEqual(["AA-01", "AA-02"]);
        expect(searchCircles("aa 01", "all")[0]?.name).toBe("Ichigowarano");
        expect(searchCircles("a40a", "sunday").map((entry) => entry.name)).toEqual(["KrapirafaS"]);
        expect(searchCircles("not-a-real-circle-name", "all")).toEqual([]);
    });
});
