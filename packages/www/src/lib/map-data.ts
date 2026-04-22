import type { BoothStatus } from "./map-themes";

export const CELL = 16;
export const STACK_WIDTH = CELL * 4;
export const COLUMN_GAP = 64;
export const ROW_GAP = 80;
export const TOP_MARGIN = 52;
export const LEFT_MARGIN = 72;
export const CORRIDOR_OFFSET = 24;
export const EXIT_OFFSET = 8;

export const SECTION_ORDER = ["E", "D", "C", "B"] as const;

export const GROUPS = [
    {
        id: "north-1",
        label: "North Hall",
        description: "Main entry rows with the fastest access from the front concourse.",
        rightNumbers: [31, 32, 33, 34, 35, 36, 37],
    },
    {
        id: "north-2",
        label: "Center Hall",
        description: "Mid-floor rows where traffic usually slows down for browsing.",
        rightNumbers: [38, 39, 40, 41, 42, 43, 44, 45],
    },
    {
        id: "south-1",
        label: "South Hall",
        description: "Back-half rows with larger booth clusters and longer dwell time.",
        rightNumbers: [46, 47, 48, 49, 50, 51, 52, 53],
    },
    {
        id: "south-2",
        label: "Annex",
        description: "Far-side rows where repeat visitors usually route through last.",
        rightNumbers: [54, 55, 56, 57, 58, 59, 60],
    },
] as const;

export const VENDORS = [
    "Atelier Nyx",
    "Pixel Lantern",
    "Paper Ronin",
    "Mecha Atelier",
    "Moss Rabbit",
    "Kitsune Press",
    "Moonlit Ink",
    "Velvet Circuit",
    "Cloud Parade",
    "Sable Studio",
    "Luna Works",
    "Crimson Print",
];

export type Section = (typeof SECTION_ORDER)[number];
export type AnchorSide = "left" | "right" | "top" | "bottom";

export type Booth = {
    id: string;
    code: string;
    stackId: string;
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    baseNumber: number;
    suffix: "a" | "b";
    label: string;
    status: BoothStatus;
    vendor: string | null;
    note: string;
    orientation: "vertical" | "horizontal" | "square";
    anchorSide: AnchorSide;
    corridorY: number;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    exitX: number;
    exitY: number;
};

export type Stack = {
    id: string;
    section: Section;
    x: number;
    y: number;
    width: number;
    height: number;
    topCorridorY: number;
    bottomCorridorY: number;
    groupLabel: string;
    groupDescription: string;
    booths: Booth[];
};

export type FloorPlan = {
    stacks: Stack[];
    booths: Booth[];
    boothById: Map<string, Booth>;
    mainAisleXs: number[];
    bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
};

export type Point = { x: number; y: number };

function padBoothNumber(value: number) {
    return value.toString().padStart(2, "0");
}

function getBoothStatus(seed: number): BoothStatus {
    if (seed % 9 === 0) return "occupied";
    if (seed % 5 === 0) return "reserved";
    return "available";
}

function getVendor(seed: number, status: BoothStatus) {
    if (status === "available") return null;
    return VENDORS[seed % VENDORS.length] ?? null;
}

function getBoothNote(status: BoothStatus, seed: number) {
    if (status === "available") {
        return seed % 2 === 0
            ? "Open half-booth with clean sightline from the aisle."
            : "Compact half-booth near an active edge.";
    }
    if (status === "reserved") {
        return seed % 2 === 0
            ? "Reserved hold pending final exhibitor paperwork."
            : "Reserved for a returning circle with late setup check-in.";
    }
    return seed % 2 === 0
        ? "Occupied half-booth with compact frontage and side traffic."
        : "Occupied half-booth with table depth for small displays.";
}

function createBooth(args: {
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    stackId: string;
    baseNumber: number;
    suffix: "a" | "b";
    orientation: "vertical" | "horizontal" | "square";
    anchorSide: AnchorSide;
    corridorY: number;
    x: number;
    y: number;
    width: number;
    height: number;
}): Booth {
    const code = `${args.section}-${padBoothNumber(args.baseNumber)}${args.suffix}`;
    const seed =
        args.baseNumber * 17 +
        args.section.charCodeAt(0) * 11 +
        args.suffix.charCodeAt(0);
    const status = getBoothStatus(seed);
    const vendor = getVendor(seed, status);

    const centerX = args.x + args.width / 2;
    const centerY = args.y + args.height / 2;

    let exitX = centerX;
    let exitY = centerY;

    if (args.anchorSide === "left") exitX = args.x - EXIT_OFFSET;
    if (args.anchorSide === "right") exitX = args.x + args.width + EXIT_OFFSET;
    if (args.anchorSide === "top") exitY = args.y - EXIT_OFFSET;
    if (args.anchorSide === "bottom") exitY = args.y + args.height + EXIT_OFFSET;

    return {
        id: code,
        code,
        stackId: args.stackId,
        section: args.section,
        groupId: args.groupId,
        groupLabel: args.groupLabel,
        groupDescription: args.groupDescription,
        baseNumber: args.baseNumber,
        suffix: args.suffix,
        label: args.suffix,
        status,
        vendor,
        note: getBoothNote(status, seed),
        orientation: args.orientation,
        anchorSide: args.anchorSide,
        corridorY: args.corridorY,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        centerX,
        centerY,
        exitX,
        exitY,
    };
}

function createStack(args: {
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    x: number;
    y: number;
    rightNumbers: readonly number[];
}): Stack {
    const booths: Booth[] = [];
    const rowCount = args.rightNumbers.length;
    const height = rowCount * CELL * 2;
    const topCorridorY = args.y - CORRIDOR_OFFSET;
    const bottomCorridorY = args.y + height + CORRIDOR_OFFSET;
    const stackId = `${args.groupId}-${args.section}`;

    args.rightNumbers.forEach((rightNumber, rowIndex) => {
        const leftNumber = 61 - rightNumber;
        const rowY = args.y + (rowCount - rowIndex - 1) * CELL * 2;
        const isTopEdge = rowIndex === 0;
        const isBottomEdge = rowIndex === rowCount - 1;
        const rowMidpoint = rowY + CELL;
        const sideCorridorY =
            rowMidpoint < args.y + height / 2 ? topCorridorY : bottomCorridorY;

        if (isTopEdge) {
            booths.push(
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: leftNumber,
                    suffix: "a",
                    orientation: "square",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x,
                    y: rowY + CELL,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: leftNumber,
                    suffix: "b",
                    orientation: "square",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x + CELL,
                    y: rowY + CELL,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: rightNumber,
                    suffix: "a",
                    orientation: "square",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x + CELL * 2,
                    y: rowY + CELL,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: rightNumber,
                    suffix: "b",
                    orientation: "square",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x + CELL * 3,
                    y: rowY + CELL,
                    width: CELL,
                    height: CELL,
                }),
            );
            return;
        }

        if (isBottomEdge) {
            booths.push(
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: leftNumber,
                    suffix: "a",
                    orientation: "square",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x,
                    y: rowY,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: leftNumber,
                    suffix: "b",
                    orientation: "square",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x + CELL,
                    y: rowY,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: rightNumber,
                    suffix: "a",
                    orientation: "square",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x + CELL * 2,
                    y: rowY,
                    width: CELL,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: rightNumber,
                    suffix: "b",
                    orientation: "square",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x + CELL * 3,
                    y: rowY,
                    width: CELL,
                    height: CELL,
                }),
            );
            return;
        }

        booths.push(
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: leftNumber,
                suffix: "a",
                orientation: "square",
                anchorSide: "left",
                corridorY: sideCorridorY,
                x: args.x,
                y: rowY,
                width: CELL,
                height: CELL,
            }),
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: leftNumber,
                suffix: "b",
                orientation: "square",
                anchorSide: "left",
                corridorY: sideCorridorY,
                x: args.x,
                y: rowY + CELL,
                width: CELL,
                height: CELL,
            }),
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: rightNumber,
                suffix: "a",
                orientation: "square",
                anchorSide: "right",
                corridorY: sideCorridorY,
                x: args.x + CELL * 3,
                y: rowY,
                width: CELL,
                height: CELL,
            }),
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: rightNumber,
                suffix: "b",
                orientation: "square",
                anchorSide: "right",
                corridorY: sideCorridorY,
                x: args.x + CELL * 3,
                y: rowY + CELL,
                width: CELL,
                height: CELL,
            }),
        );
    });

    return {
        id: stackId,
        section: args.section,
        x: args.x,
        y: args.y,
        width: STACK_WIDTH,
        height,
        topCorridorY,
        bottomCorridorY,
        groupLabel: args.groupLabel,
        groupDescription: args.groupDescription,
        booths,
    };
}

export function buildFloorPlan(): FloorPlan {
    const stacks: Stack[] = [];
    const booths: Booth[] = [];

    let currentY = TOP_MARGIN;

    for (const group of GROUPS) {
        const stackHeight = group.rightNumbers.length * CELL * 2;

        SECTION_ORDER.forEach((section, columnIndex) => {
            const x = LEFT_MARGIN + columnIndex * (STACK_WIDTH + COLUMN_GAP);
            const stack = createStack({
                section,
                groupId: group.id,
                groupLabel: group.label,
                groupDescription: group.description,
                x,
                y: currentY,
                rightNumbers: group.rightNumbers,
            });
            stacks.push(stack);
            booths.push(...stack.booths);
        });

        currentY += stackHeight + ROW_GAP;
    }

    const firstColumnX = LEFT_MARGIN;
    const lastColumnX =
        LEFT_MARGIN + (SECTION_ORDER.length - 1) * (STACK_WIDTH + COLUMN_GAP);
    const mainAisleXs = [
        firstColumnX - 56,
        ...SECTION_ORDER.slice(0, -1).map(
            (_, index) =>
                LEFT_MARGIN +
                index * (STACK_WIDTH + COLUMN_GAP) +
                STACK_WIDTH +
                COLUMN_GAP / 2,
        ),
        lastColumnX + STACK_WIDTH + 56,
    ];

    const minX = firstColumnX - 28;
    const maxX = lastColumnX + STACK_WIDTH + 28;
    const minY = Math.min(...stacks.map((stack) => stack.topCorridorY)) - 20;
    const maxY = Math.max(...stacks.map((stack) => stack.bottomCorridorY)) + 24;

    return {
        stacks,
        booths,
        boothById: new Map(booths.map((booth) => [booth.id, booth])),
        mainAisleXs,
        bounds: { minX, minY, maxX, maxY },
    };
}

export function buildRoutePoints(
    startBooth: Booth | null,
    endBooth: Booth | null,
    mainAisleXs: number[],
): Point[] {
    if (!startBooth || !endBooth || startBooth.id === endBooth.id) return [];

    const points: Point[] = [
        { x: startBooth.centerX, y: startBooth.centerY },
        { x: startBooth.exitX, y: startBooth.exitY },
    ];

    const startCorridor = { x: startBooth.exitX, y: startBooth.corridorY };
    const endCorridor = { x: endBooth.exitX, y: endBooth.corridorY };

    points.push(startCorridor);

    if (startCorridor.y === endCorridor.y) {
        points.push(endCorridor);
    } else {
        const aisleX = mainAisleXs.reduce((best, candidate) => {
            const bestDistance =
                Math.abs(startCorridor.x - best) + Math.abs(endCorridor.x - best);
            const candidateDistance =
                Math.abs(startCorridor.x - candidate) +
                Math.abs(endCorridor.x - candidate);
            return candidateDistance < bestDistance ? candidate : best;
        }, mainAisleXs[0] ?? startCorridor.x);

        points.push(
            { x: aisleX, y: startCorridor.y },
            { x: aisleX, y: endCorridor.y },
            endCorridor,
        );
    }

    points.push(
        { x: endBooth.exitX, y: endBooth.exitY },
        { x: endBooth.centerX, y: endBooth.centerY },
    );

    return points.filter((point, index, array) => {
        if (index === 0) return true;
        const prev = array[index - 1];
        return prev.x !== point.x || prev.y !== point.y;
    });
}

export function pointsToPath(points: Point[]) {
    if (points.length === 0) return "";
    return points
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" ");
}

export function routeDistance(points: Point[]) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total +=
            Math.abs(points[index]!.x - points[index - 1]!.x) +
            Math.abs(points[index]!.y - points[index - 1]!.y);
    }
    return Math.round(total / 8);
}

export function normalizeSearchValue(value: string) {
    return value.trim().toLowerCase();
}

export function createBoothSearchText(booth: Booth) {
    return [
        booth.code,
        booth.label,
        booth.vendor,
        booth.groupLabel,
        booth.groupDescription,
        booth.section,
        booth.note,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

export function getBoothSearchScore(booth: Booth, query: string) {
    const normalizedCode = booth.code.toLowerCase();
    const normalizedVendor = booth.vendor?.toLowerCase() ?? "";
    const normalizedGroup = booth.groupLabel.toLowerCase();

    if (normalizedCode === query) return 0;
    if (normalizedCode.startsWith(query)) return 1;
    if (normalizedVendor === query) return 2;
    if (normalizedVendor.startsWith(query)) return 3;
    if (normalizedGroup.startsWith(query)) return 4;
    return 5;
}

export const floorPlan = buildFloorPlan();
export const DEFAULT_SELECTED_BOOTH = "E-31a";
export const DEFAULT_START_BOOTH = "E-31a";
export const DEFAULT_END_BOOTH = "B-58b";
export const SEARCH_RESULT_LIMIT = 12;

export const boothSearchIndex = floorPlan.booths.map((booth) => ({
    booth,
    searchText: createBoothSearchText(booth),
}));
