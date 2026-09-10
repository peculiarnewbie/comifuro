import data from "./cf22-map.generated.json";

export type MapDay = "all" | "saturday" | "sunday";
export type CircleEntry = (typeof data.entries)[number];
export type MapBooth = (typeof data.booths)[number];
export const mapBounds = data.bounds;
export const mapBooths = data.booths;
export const circleEntries = data.entries;
export const boothByCode = new Map(mapBooths.map((booth) => [booth.code, booth]));
const entriesByCode = new Map<string, CircleEntry[]>();
for (const entry of circleEntries) {
    for (const code of entry.codes) {
        const entries = entriesByCode.get(code) ?? [];
        entries.push(entry);
        entriesByCode.set(code, entries);
    }
}
export function entriesForBooth(code: string, day: MapDay = "all") {
    return (entriesByCode.get(code) ?? []).filter(
        (entry) => day === "all" || entry.day === "both" || entry.day === day,
    );
}
export function dayLabel(day: string) {
    return day === "saturday" ? "Saturday" : day === "sunday" ? "Sunday" : "Both days";
}
const normalize = (value: string) =>
    value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[\s-]+/g, "");
const searchIndex = circleEntries.map((entry) => ({
    entry,
    name: normalize(entry.name),
    codes: entry.codes.map(normalize),
}));
export function searchCircles(query: string, day: MapDay) {
    const term = normalize(query);
    return searchIndex
        .filter(
            ({ entry, name, codes }) =>
                (day === "all" || entry.day === "both" || entry.day === day) &&
                (!term || name.includes(term) || codes.some((code) => code.includes(term))),
        )
        .map(({ entry }) => entry);
}
