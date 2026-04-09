import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createMemo, createSignal } from "solid-js";

const CELL = 16;
const STACK_WIDTH = CELL * 4;
const COLUMN_GAP = 64;
const ROW_GAP = 80;
const TOP_MARGIN = 52;
const LEFT_MARGIN = 72;
const CORRIDOR_OFFSET = 24;
const EXIT_OFFSET = 8;

const SECTION_ORDER = ["E", "D", "C", "B"] as const;
const GROUPS = [
    {
        id: "north-1",
        label: "North Hall",
        description:
            "Main entry rows with the fastest access from the front concourse.",
        rightNumbers: [31, 32, 33, 34, 35, 36, 37],
    },
    {
        id: "north-2",
        label: "Center Hall",
        description:
            "Mid-floor rows where traffic usually slows down for browsing.",
        rightNumbers: [38, 39, 40, 41, 42, 43, 44, 45],
    },
    {
        id: "south-1",
        label: "South Hall",
        description:
            "Back-half rows with larger booth clusters and longer dwell time.",
        rightNumbers: [46, 47, 48, 49, 50, 51, 52, 53],
    },
    {
        id: "south-2",
        label: "Annex",
        description:
            "Far-side rows where repeat visitors usually route through last.",
        rightNumbers: [54, 55, 56, 57, 58, 59, 60],
    },
] as const;

const VENDORS = [
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

type Section = (typeof SECTION_ORDER)[number];
type BoothStatus = "available" | "reserved" | "occupied";
type BoothKind = "main" | "split";
type AnchorSide = "left" | "right" | "top" | "bottom";

type Booth = {
    id: string;
    code: string;
    stackId: string;
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    baseNumber: number;
    suffix: "a" | "b" | null;
    label: string;
    status: BoothStatus;
    vendor: string | null;
    note: string;
    kind: BoothKind;
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

type Stack = {
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

type FloorPlan = {
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

type Point = {
    x: number;
    y: number;
};

export const Route = createFileRoute("/map")({
    component: RouteComponent,
});

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

function getBoothNote(kind: BoothKind, status: BoothStatus, seed: number) {
    if (status === "available") {
        return kind === "split"
            ? "Open split booth near an active aisle edge."
            : "Open full booth with clean sightline from the main aisle.";
    }

    if (status === "reserved") {
        return seed % 2 === 0
            ? "Reserved hold pending final exhibitor paperwork."
            : "Reserved for a returning circle with late setup check-in.";
    }

    return kind === "split"
        ? "Occupied micro-booth with compact frontage and side traffic."
        : "Occupied full booth with table depth for displays and queueing.";
}

function createBooth(args: {
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    stackId: string;
    baseNumber: number;
    suffix: "a" | "b" | null;
    kind: BoothKind;
    orientation: "vertical" | "horizontal" | "square";
    anchorSide: AnchorSide;
    corridorY: number;
    x: number;
    y: number;
    width: number;
    height: number;
}) {
    const suffixPart = args.suffix ?? "";
    const code = `${args.section}-${padBoothNumber(args.baseNumber)}${suffixPart}`;
    const seed =
        args.baseNumber * 17 +
        args.section.charCodeAt(0) * 11 +
        (args.suffix?.charCodeAt(0) ?? 3);
    const status = getBoothStatus(seed);
    const vendor = getVendor(seed, status);

    const centerX = args.x + args.width / 2;
    const centerY = args.y + args.height / 2;

    let exitX = centerX;
    let exitY = centerY;

    if (args.anchorSide === "left") exitX = args.x - EXIT_OFFSET;
    if (args.anchorSide === "right") exitX = args.x + args.width + EXIT_OFFSET;
    if (args.anchorSide === "top") exitY = args.y - EXIT_OFFSET;
    if (args.anchorSide === "bottom")
        exitY = args.y + args.height + EXIT_OFFSET;

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
        label: args.suffix ?? padBoothNumber(args.baseNumber),
        status,
        vendor,
        note: getBoothNote(args.kind, status, seed),
        kind: args.kind,
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
    } satisfies Booth;
}

function createStack(args: {
    section: Section;
    groupId: string;
    groupLabel: string;
    groupDescription: string;
    x: number;
    y: number;
    rightNumbers: readonly number[];
}) {
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
                    suffix: null,
                    kind: "main",
                    orientation: "horizontal",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x,
                    y: rowY,
                    width: CELL * 2,
                    height: CELL,
                }),
                createBooth({
                    section: args.section,
                    groupId: args.groupId,
                    groupLabel: args.groupLabel,
                    groupDescription: args.groupDescription,
                    stackId,
                    baseNumber: leftNumber,
                    suffix: "a",
                    kind: "split",
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
                    kind: "split",
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
                    suffix: null,
                    kind: "main",
                    orientation: "horizontal",
                    anchorSide: "top",
                    corridorY: topCorridorY,
                    x: args.x + CELL * 2,
                    y: rowY,
                    width: CELL * 2,
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
                    kind: "split",
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
                    kind: "split",
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
                    kind: "split",
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
                    kind: "split",
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
                    baseNumber: leftNumber,
                    suffix: null,
                    kind: "main",
                    orientation: "horizontal",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x,
                    y: rowY + CELL,
                    width: CELL * 2,
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
                    kind: "split",
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
                    kind: "split",
                    orientation: "square",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
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
                    suffix: null,
                    kind: "main",
                    orientation: "horizontal",
                    anchorSide: "bottom",
                    corridorY: bottomCorridorY,
                    x: args.x + CELL * 2,
                    y: rowY + CELL,
                    width: CELL * 2,
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
                kind: "split",
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
                kind: "split",
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
                baseNumber: leftNumber,
                suffix: null,
                kind: "main",
                orientation: "vertical",
                anchorSide: "left",
                corridorY: sideCorridorY,
                x: args.x + CELL,
                y: rowY,
                width: CELL,
                height: CELL * 2,
            }),
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: rightNumber,
                suffix: null,
                kind: "main",
                orientation: "vertical",
                anchorSide: "right",
                corridorY: sideCorridorY,
                x: args.x + CELL * 2,
                y: rowY,
                width: CELL,
                height: CELL * 2,
            }),
            createBooth({
                section: args.section,
                groupId: args.groupId,
                groupLabel: args.groupLabel,
                groupDescription: args.groupDescription,
                stackId,
                baseNumber: rightNumber,
                suffix: "a",
                kind: "split",
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
                kind: "split",
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
    } satisfies Stack;
}

function buildFloorPlan() {
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
    } satisfies FloorPlan;
}

function buildRoutePoints(
    startBooth: Booth | null,
    endBooth: Booth | null,
    mainAisleXs: number[],
) {
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
                Math.abs(startCorridor.x - best) +
                Math.abs(endCorridor.x - best);
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

function pointsToPath(points: Point[]) {
    if (points.length === 0) return "";
    return points
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" ");
}

function getStatusClasses(status: BoothStatus) {
    if (status === "occupied") {
        return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    }

    if (status === "reserved") {
        return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
    }

    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
}

function formatBoothKind(booth: Booth) {
    return booth.kind === "main" ? "Full booth" : "Split booth";
}

function normalizeSearchValue(value: string) {
    return value.trim().toLowerCase();
}

function createBoothSearchText(booth: Booth) {
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

function getBoothSearchScore(booth: Booth, query: string) {
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

function boothFill(
    booth: Booth,
    selectedId: string | null,
    startId: string | null,
    endId: string | null,
) {
    if (booth.id === startId) return "#a5f3fc";
    if (booth.id === endId) return "#ddd6fe";
    if (booth.id === selectedId) return "#bfdbfe";

    if (booth.status === "occupied") return "#fee2e2";
    if (booth.status === "reserved") return "#fef3c7";
    return booth.kind === "split" ? "#eff6ff" : "#ffffff";
}

function boothStroke(
    booth: Booth,
    selectedId: string | null,
    startId: string | null,
    endId: string | null,
) {
    if (booth.id === startId) return "#0891b2";
    if (booth.id === endId) return "#7c3aed";
    if (booth.id === selectedId) return "#2563eb";
    return "#334155";
}

function AisleLabel(props: { x: number; y: number; text: string }) {
    return (
        <text
            x={props.x}
            y={props.y}
            fill="#64748b"
            font-size="10"
            text-anchor="middle"
            font-family="ui-sans-serif, system-ui, Arial"
            style={{ "pointer-events": "none" }}
        >
            {props.text}
        </text>
    );
}

function SectionPill(props: { x: number; y: number; text: string }) {
    return (
        <g transform={`translate(${props.x} ${props.y})`}>
            <rect
                x={-18}
                y={-12}
                width={36}
                height={24}
                rx="4"
                fill="#ffffff"
                stroke="#cbd5e1"
            />
            <text
                x="0"
                y="4"
                fill="#0f172a"
                font-size="12"
                text-anchor="middle"
                font-family="ui-sans-serif, system-ui, Arial"
                style={{ "pointer-events": "none", "font-weight": 600 }}
            >
                {props.text}
            </text>
        </g>
    );
}

function BoothGraphic(props: {
    booth: Booth;
    selectedId: string | null;
    startId: string | null;
    endId: string | null;
    onSelect: (boothId: string) => void;
}) {
    const textY =
        props.booth.orientation === "vertical"
            ? props.booth.centerY + 3
            : props.booth.centerY + 3;
    const fontSize = props.booth.kind === "main" ? "8.5" : "9";

    return (
        <g>
            <rect
                x={props.booth.x}
                y={props.booth.y}
                width={props.booth.width}
                height={props.booth.height}
                rx="1.5"
                fill={boothFill(
                    props.booth,
                    props.selectedId,
                    props.startId,
                    props.endId,
                )}
                stroke={boothStroke(
                    props.booth,
                    props.selectedId,
                    props.startId,
                    props.endId,
                )}
                stroke-width={
                    props.booth.id === props.selectedId ? "1.5" : "0.75"
                }
                class="cursor-pointer transition-colors duration-100"
                tabindex={0}
                role="button"
                aria-label={`Select booth ${props.booth.code}`}
                onPointerDown={(event) => {
                    event.stopPropagation();
                }}
                onPointerUp={(event) => {
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.stopPropagation();
                    props.onSelect(props.booth.id);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        props.onSelect(props.booth.id);
                    }
                }}
            />
            <text
                x={props.booth.centerX}
                y={textY}
                fill="#0f172a"
                font-size={fontSize}
                text-anchor="middle"
                font-family="ui-sans-serif, system-ui, Arial"
                style={{ "pointer-events": "none", "user-select": "none" }}
            >
                {props.booth.label}
            </text>
        </g>
    );
}

const floorPlan = buildFloorPlan();
const DEFAULT_SELECTED_BOOTH = "E-31";
const DEFAULT_START_BOOTH = "E-31";
const DEFAULT_END_BOOTH = "B-58b";
const SEARCH_RESULT_LIMIT = 12;
const boothSearchIndex = floorPlan.booths.map((booth) => ({
    booth,
    searchText: createBoothSearchText(booth),
}));

function RouteComponent() {
    const [cam, setCam] = createSignal({ x: 0, y: 0, s: 1 });
    const [selectedBoothId, setSelectedBoothId] = createSignal<string | null>(
        DEFAULT_SELECTED_BOOTH,
    );
    const [startBoothId, setStartBoothId] = createSignal<string | null>(
        DEFAULT_START_BOOTH,
    );
    const [endBoothId, setEndBoothId] = createSignal<string | null>(
        DEFAULT_END_BOOTH,
    );
    const [isDragging, setIsDragging] = createSignal(false);
    const [searchQuery, setSearchQuery] = createSignal("");

    const selectedBooth = createMemo(
        () => floorPlan.boothById.get(selectedBoothId() ?? "") ?? null,
    );
    const startBooth = createMemo(
        () => floorPlan.boothById.get(startBoothId() ?? "") ?? null,
    );
    const endBooth = createMemo(
        () => floorPlan.boothById.get(endBoothId() ?? "") ?? null,
    );
    const routePoints = createMemo(() =>
        buildRoutePoints(startBooth(), endBooth(), floorPlan.mainAisleXs),
    );
    const routeDistance = createMemo(() => {
        const points = routePoints();
        let total = 0;

        for (let index = 1; index < points.length; index += 1) {
            total +=
                Math.abs(points[index]!.x - points[index - 1]!.x) +
                Math.abs(points[index]!.y - points[index - 1]!.y);
        }

        return Math.round(total / 8);
    });
    const searchResults = createMemo(() => {
        const query = normalizeSearchValue(searchQuery());
        if (!query) return [];

        return boothSearchIndex
            .filter(({ searchText }) => searchText.includes(query))
            .sort(
                (left, right) =>
                    getBoothSearchScore(left.booth, query) -
                        getBoothSearchScore(right.booth, query) ||
                    left.booth.code.localeCompare(right.booth.code),
            )
            .slice(0, SEARCH_RESULT_LIMIT)
            .map(({ booth }) => booth);
    });

    const floorCenter = {
        x: (floorPlan.bounds.minX + floorPlan.bounds.maxX) / 2,
        y: (floorPlan.bounds.minY + floorPlan.bounds.maxY) / 2,
    };

    const MIN_S = 0.5;
    const MAX_S = 3;

    const pointers = new Map<number, { x: number; y: number }>();
    let lastPan: { x: number; y: number } | null = null;
    let lastDistance = 0;
    let lastCenter: { x: number; y: number } | null = null;
    let panDistance = 0;
    let svgEl: SVGSVGElement | null = null;

    let inertiaRAF: number | null = null;
    let inertVx = 0;
    let inertVy = 0;

    type Sample = { t: number; dx: number; dy: number };
    const samples: Sample[] = [];
    const MAX_SAMPLES = 5;

    function clientToSvg(x: number, y: number) {
        if (!svgEl) return { x, y };
        const pt = svgEl.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const matrix = (svgEl.getScreenCTM() as DOMMatrix | null)?.inverse();
        if (!matrix) return { x, y };
        const point = pt.matrixTransform(matrix);
        return { x: point.x, y: point.y };
    }

    function zoomAround(focal: { x: number; y: number }, factor: number) {
        setCam((current) => {
            const nextScale = Math.max(
                MIN_S,
                Math.min(MAX_S, current.s * factor),
            );
            const ratio = nextScale / current.s;
            return {
                x: focal.x - ratio * (focal.x - current.x),
                y: focal.y - ratio * (focal.y - current.y),
                s: nextScale,
            };
        });
    }

    function getViewportCenter() {
        if (!svgEl) return floorCenter;

        const rect = svgEl.getBoundingClientRect();
        return clientToSvg(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
        );
    }

    function resetView() {
        setCam({ x: 0, y: 0, s: 1 });
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0015);
        const focal = clientToSvg(event.clientX, event.clientY);
        zoomAround(focal, factor);
    }

    function stopInertia() {
        if (inertiaRAF != null) {
            cancelAnimationFrame(inertiaRAF);
            inertiaRAF = null;
        }

        inertVx = 0;
        inertVy = 0;
    }

    function getInertiaFriction() {
        const width = svgEl?.getBoundingClientRect().width ?? 400;
        const baseline = 400;
        const scale = Math.max(0.5, Math.min(3, width / baseline));
        return 0.01 * scale;
    }

    function startInertia(vx: number, vy: number) {
        if (Math.hypot(vx, vy) < 0.05) return;

        inertVx = vx;
        inertVy = vy;

        let lastT = performance.now();
        const friction = getInertiaFriction();
        const maxStep = 60;

        const tick = () => {
            const now = performance.now();
            const dt = Math.max(0, now - lastT);
            lastT = now;

            const decay = Math.exp(-friction * dt);
            inertVx *= decay;
            inertVy *= decay;

            if (Math.hypot(inertVx, inertVy) < 0.02) {
                stopInertia();
                return;
            }

            let dx = inertVx * dt;
            let dy = inertVy * dt;
            const stepLength = Math.hypot(dx, dy);

            if (stepLength > maxStep) {
                const ratio = maxStep / stepLength;
                dx *= ratio;
                dy *= ratio;
            }

            setCam((current) => ({
                ...current,
                x: current.x + dx,
                y: current.y + dy,
            }));
            inertiaRAF = requestAnimationFrame(tick);
        };

        inertiaRAF = requestAnimationFrame(tick);
    }

    function onPointerDown(event: PointerEvent) {
        if (event.pointerType === "mouse" && event.button !== 0) return;

        (event.currentTarget as Element).setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        stopInertia();
        samples.length = 0;
        panDistance = 0;
        setIsDragging(false);

        if (pointers.size === 1) {
            lastPan = { x: event.clientX, y: event.clientY };
            return;
        }

        if (pointers.size === 2) {
            const entries = [...pointers.values()];
            const dx = entries[0]!.x - entries[1]!.x;
            const dy = entries[0]!.y - entries[1]!.y;
            lastDistance = Math.hypot(dx, dy);
            lastCenter = clientToSvg(
                (entries[0]!.x + entries[1]!.x) / 2,
                (entries[0]!.y + entries[1]!.y) / 2,
            );
            lastPan = null;
        }
    }

    function onPointerMove(event: PointerEvent) {
        if (!pointers.has(event.pointerId)) return;

        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 1 && lastPan) {
            const previousPoint = clientToSvg(lastPan.x, lastPan.y);
            const nextPoint = clientToSvg(event.clientX, event.clientY);
            const dx = nextPoint.x - previousPoint.x;
            const dy = nextPoint.y - previousPoint.y;
            panDistance += Math.hypot(
                event.clientX - lastPan.x,
                event.clientY - lastPan.y,
            );

            if (panDistance > 2) setIsDragging(true);

            lastPan = { x: event.clientX, y: event.clientY };
            setCam((current) => ({
                ...current,
                x: current.x + dx,
                y: current.y + dy,
            }));

            const now = performance.now();
            samples.push({ t: now, dx, dy });
            if (samples.length > MAX_SAMPLES) samples.shift();
            return;
        }

        if (pointers.size === 2 && lastCenter) {
            const entries = [...pointers.values()];
            const dx = entries[0]!.x - entries[1]!.x;
            const dy = entries[0]!.y - entries[1]!.y;
            const distance = Math.hypot(dx, dy);

            if (lastDistance > 0) {
                zoomAround(lastCenter, distance / lastDistance);
            }

            lastDistance = distance;
            lastCenter = clientToSvg(
                (entries[0]!.x + entries[1]!.x) / 2,
                (entries[0]!.y + entries[1]!.y) / 2,
            );
            samples.length = 0;
        }
    }

    function computeReleaseVelocity() {
        if (samples.length === 0) return { vx: 0, vy: 0 };

        const now = performance.now();
        const windowMs = 120;
        let sumW = 0;
        let vx = 0;
        let vy = 0;

        for (let index = samples.length - 1; index >= 0; index -= 1) {
            const sample = samples[index]!;
            const dt = Math.max(1, now - sample.t);
            if (now - sample.t > windowMs) break;
            const weight = 1 / dt;
            vx += (sample.dx / (dt / 16.67)) * weight;
            vy += (sample.dy / (dt / 16.67)) * weight;
            sumW += weight;
        }

        if (sumW === 0) return { vx: 0, vy: 0 };

        vx /= sumW;
        vy /= sumW;

        const maxInitial = 3.2;
        const magnitude = Math.hypot(vx, vy);

        if (magnitude > maxInitial) {
            const ratio = maxInitial / magnitude;
            vx *= ratio;
            vy *= ratio;
        }

        return { vx, vy };
    }

    function endPointer(event: PointerEvent) {
        pointers.delete(event.pointerId);

        if (pointers.size === 0) {
            if (lastPan && panDistance > 2) {
                const { vx, vy } = computeReleaseVelocity();
                startInertia(vx, vy);
            }

            lastPan = null;
            lastDistance = 0;
            lastCenter = null;
            panDistance = 0;
            samples.length = 0;
            setIsDragging(false);
            return;
        }

        if (pointers.size === 1) {
            const [remaining] = [...pointers.values()];
            lastPan = { x: remaining!.x, y: remaining!.y };
            lastDistance = 0;
            lastCenter = null;
            panDistance = 0;
            samples.length = 0;
            setIsDragging(false);
        }
    }

    function zoomIn() {
        zoomAround(getViewportCenter(), 1.2);
    }

    function zoomOut() {
        zoomAround(getViewportCenter(), 1 / 1.2);
    }

    function focusBooth(boothId: string, scale = 2.2) {
        const booth = floorPlan.boothById.get(boothId);
        if (!booth) return;

        const nextScale = Math.max(MIN_S, Math.min(MAX_S, scale));
        const targetCenter = getViewportCenter();
        stopInertia();
        setSelectedBoothId(booth.id);
        setCam({
            x: targetCenter.x - booth.centerX * nextScale,
            y: targetCenter.y - booth.centerY * nextScale,
            s: nextScale,
        });
    }

    function assignSelectedToStart() {
        if (!selectedBooth()) return;
        setStartBoothId(selectedBooth()!.id);
    }

    function assignSelectedToEnd() {
        if (!selectedBooth()) return;
        setEndBoothId(selectedBooth()!.id);
    }

    function swapRoute() {
        const start = startBoothId();
        const end = endBoothId();
        setStartBoothId(end);
        setEndBoothId(start);
    }

    const viewBox = `${floorPlan.bounds.minX} ${floorPlan.bounds.minY} ${floorPlan.bounds.maxX - floorPlan.bounds.minX} ${floorPlan.bounds.maxY - floorPlan.bounds.minY}`;

    return (
        <main class="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
            <div class="flex h-full w-full">
                <section class="relative min-w-0 flex-1 overflow-hidden bg-slate-100">
                    <svg
                        ref={(element) => {
                            svgEl = element;
                        }}
                        width="100%"
                        height="100%"
                        viewBox={viewBox}
                        preserveAspectRatio="xMinYMin slice"
                        class="h-full w-full touch-none"
                        style={{ cursor: isDragging() ? "grabbing" : "grab" }}
                        onWheel={onWheel}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endPointer}
                        onPointerCancel={endPointer}
                    >
                        <rect
                            x={floorPlan.bounds.minX}
                            y={floorPlan.bounds.minY}
                            width={
                                floorPlan.bounds.maxX - floorPlan.bounds.minX
                            }
                            height={
                                floorPlan.bounds.maxY - floorPlan.bounds.minY
                            }
                            fill="#f8fafc"
                            onClick={() => setSelectedBoothId(null)}
                        />

                        <g transform={`translate(${cam().x} ${cam().y})`}>
                            <g
                                transform={`scale(${cam().s})`}
                                vector-effect="non-scaling-stroke"
                            >
                                <For each={floorPlan.mainAisleXs}>
                                    {(x, index) => (
                                        <g>
                                            <line
                                                x1={x}
                                                y1={floorPlan.bounds.minY + 20}
                                                x2={x}
                                                y2={floorPlan.bounds.maxY - 20}
                                                stroke="#e2e8f0"
                                                stroke-width="2"
                                                stroke-dasharray="10 10"
                                            />
                                            <AisleLabel
                                                x={x}
                                                y={floorPlan.bounds.minY + 10}
                                                text={`Aisle ${index() + 1}`}
                                            />
                                        </g>
                                    )}
                                </For>

                                <For each={GROUPS}>
                                    {(group) => {
                                        const rowStacks =
                                            floorPlan.stacks.filter(
                                                (stack) =>
                                                    stack.groupLabel ===
                                                    group.label,
                                            );
                                        const topCorridorY =
                                            rowStacks[0]?.topCorridorY ?? 0;
                                        const bottomCorridorY =
                                            rowStacks[0]?.bottomCorridorY ?? 0;
                                        const centerY =
                                            ((rowStacks[0]?.y ?? 0) +
                                                (rowStacks[0]?.y ?? 0) +
                                                (rowStacks[0]?.height ?? 0)) /
                                            2;

                                        return (
                                            <g>
                                                <line
                                                    x1={
                                                        floorPlan.bounds.minX +
                                                        24
                                                    }
                                                    y1={topCorridorY}
                                                    x2={
                                                        floorPlan.bounds.maxX -
                                                        24
                                                    }
                                                    y2={topCorridorY}
                                                    stroke="#e2e8f0"
                                                    stroke-width="1"
                                                    stroke-dasharray="6 10"
                                                />
                                                <line
                                                    x1={
                                                        floorPlan.bounds.minX +
                                                        24
                                                    }
                                                    y1={bottomCorridorY}
                                                    x2={
                                                        floorPlan.bounds.maxX -
                                                        24
                                                    }
                                                    y2={bottomCorridorY}
                                                    stroke="#e2e8f0"
                                                    stroke-width="1"
                                                    stroke-dasharray="6 10"
                                                />
                                                <text
                                                    x={
                                                        floorPlan.bounds.minX +
                                                        10
                                                    }
                                                    y={centerY}
                                                    fill="#475569"
                                                    font-size="12"
                                                    font-family="ui-sans-serif, system-ui, Arial"
                                                >
                                                    {group.label}
                                                </text>
                                            </g>
                                        );
                                    }}
                                </For>

                                <Show when={routePoints().length > 0}>
                                    <path
                                        d={pointsToPath(routePoints())}
                                        fill="none"
                                        stroke="#0f172a"
                                        stroke-width="4"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-dasharray="12 6"
                                        opacity="0.85"
                                    />
                                </Show>

                                <For each={floorPlan.stacks}>
                                    {(stack) => (
                                        <g>
                                            <SectionPill
                                                x={stack.x + stack.width / 2}
                                                y={stack.y - 34}
                                                text={stack.section}
                                            />
                                            <rect
                                                x={stack.x}
                                                y={stack.y}
                                                width={stack.width}
                                                height={stack.height}
                                                fill="#ffffff"
                                                stroke="#cbd5e1"
                                                stroke-width="1"
                                                rx="3"
                                            />
                                            <For each={stack.booths}>
                                                {(booth) => (
                                                    <BoothGraphic
                                                        booth={booth}
                                                        selectedId={selectedBoothId()}
                                                        startId={startBoothId()}
                                                        endId={endBoothId()}
                                                        onSelect={
                                                            setSelectedBoothId
                                                        }
                                                    />
                                                )}
                                            </For>
                                            <SectionPill
                                                x={stack.x + stack.width / 2}
                                                y={stack.y + stack.height + 34}
                                                text={stack.section}
                                            />
                                        </g>
                                    )}
                                </For>

                                <Show when={startBooth()}>
                                    {(booth) => (
                                        <circle
                                            cx={booth().centerX}
                                            cy={booth().centerY}
                                            r="4"
                                            fill="#0891b2"
                                            stroke="#ffffff"
                                            stroke-width="2"
                                        />
                                    )}
                                </Show>

                                <Show when={endBooth()}>
                                    {(booth) => (
                                        <circle
                                            cx={booth().centerX}
                                            cy={booth().centerY}
                                            r="4"
                                            fill="#7c3aed"
                                            stroke="#ffffff"
                                            stroke-width="2"
                                        />
                                    )}
                                </Show>
                            </g>
                        </g>
                    </svg>
                </section>

                <aside class="h-full w-[360px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white xl:w-[380px]">
                    <div class="flex min-h-full flex-col gap-4 p-4 lg:p-5">
                        <section class="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Booth Search
                                    </p>
                                    <h2 class="text-lg font-semibold text-slate-950">
                                        Jump to a booth
                                    </h2>
                                </div>
                                <span class="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                                    {floorPlan.booths.length} total
                                </span>
                            </div>

                            <label class="block">
                                <span class="sr-only">Search booths</span>
                                <input
                                    type="search"
                                    value={searchQuery()}
                                    onInput={(event) =>
                                        setSearchQuery(event.currentTarget.value)
                                    }
                                    placeholder="Search booth code, exhibitor, or hall"
                                    class="w-full rounded-2xl border-0 bg-white px-3 py-2.5 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/15"
                                />
                            </label>

                            <div class="space-y-2">
                                <Show
                                    when={searchQuery().trim().length > 0}
                                    fallback={
                                        <p class="rounded-2xl bg-white px-3 py-2.5 text-sm text-slate-500 ring-1 ring-slate-200">
                                            Search by booth code now. When booth
                                            names get added later, this panel
                                            can match those too.
                                        </p>
                                    }
                                >
                                    <Show
                                        when={searchResults().length > 0}
                                        fallback={
                                            <p class="rounded-2xl bg-white px-3 py-2.5 text-sm text-slate-500 ring-1 ring-slate-200">
                                                No booths matched "
                                                {searchQuery().trim()}".
                                            </p>
                                        }
                                    >
                                        <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
                                            <For each={searchResults()}>
                                                {(booth) => (
                                                    <button
                                                        class={`block w-full rounded-2xl px-3 py-2.5 text-left transition ring-1 ${
                                                            selectedBoothId() ===
                                                            booth.id
                                                                ? "bg-slate-900 text-white ring-slate-900"
                                                                : "bg-white text-slate-900 ring-slate-200 hover:bg-slate-50"
                                                        }`}
                                                        onClick={() =>
                                                            focusBooth(booth.id)
                                                        }
                                                    >
                                                        <div class="flex items-center justify-between gap-3">
                                                            <div class="text-sm font-semibold">
                                                                {booth.code}
                                                            </div>
                                                            <span
                                                                class={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                    selectedBoothId() ===
                                                                    booth.id
                                                                        ? "bg-white/15 text-white"
                                                                        : getStatusClasses(
                                                                              booth.status,
                                                                          )
                                                                }`}
                                                            >
                                                                {booth.status}
                                                            </span>
                                                        </div>
                                                        <div
                                                            class={`mt-1 text-xs ${
                                                                selectedBoothId() ===
                                                                booth.id
                                                                    ? "text-slate-300"
                                                                    : "text-slate-500"
                                                            }`}
                                                        >
                                                            {booth.vendor ??
                                                                "Unassigned booth"}{" "}
                                                            - {booth.groupLabel}
                                                        </div>
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Show>
                                </Show>
                            </div>
                        </section>

                        <section class="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
                            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                                Map Summary
                            </p>
                            <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                                <div class="rounded-2xl bg-white/10 p-3">
                                    <div class="text-slate-300">
                                        Booth cells
                                    </div>
                                    <div class="mt-1 text-xl font-semibold text-white">
                                        {floorPlan.booths.length}
                                    </div>
                                </div>
                                <div class="rounded-2xl bg-white/10 p-3">
                                    <div class="text-slate-300">Stacks</div>
                                    <div class="mt-1 text-xl font-semibold text-white">
                                        {floorPlan.stacks.length}
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3 flex flex-wrap gap-2">
                                <button
                                    class="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                                    onClick={zoomIn}
                                >
                                    Zoom in
                                </button>
                                <button
                                    class="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15"
                                    onClick={zoomOut}
                                >
                                    Zoom out
                                </button>
                                <button
                                    class="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15"
                                    onClick={resetView}
                                >
                                    Reset view
                                </button>
                            </div>
                            <p class="mt-3 text-sm text-slate-200">
                                Search from the sidebar, jump straight to a
                                booth, then set route start and destination
                                from the detail panel.
                            </p>
                        </section>

                        <section class="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Selected Booth
                                    </p>
                                    <Show
                                        when={selectedBooth()}
                                        fallback={
                                            <h2 class="text-lg font-semibold">
                                                Pick any booth
                                            </h2>
                                        }
                                    >
                                        {(booth) => (
                                            <h2 class="text-2xl font-semibold tracking-tight text-slate-950">
                                                {booth().code}
                                            </h2>
                                        )}
                                    </Show>
                                </div>

                                <Show when={selectedBooth()}>
                                    {(booth) => (
                                        <span
                                            class={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                                                booth().status,
                                            )}`}
                                        >
                                            {booth().status}
                                        </span>
                                    )}
                                </Show>
                            </div>

                            <Show
                                when={selectedBooth()}
                                fallback={
                                    <p class="text-sm text-slate-600">
                                        Click a booth cell in the map to inspect
                                        it, then assign it as the start or
                                        destination for a route.
                                    </p>
                                }
                            >
                                {(booth) => (
                                    <div class="space-y-4 text-sm text-slate-700">
                                        <div class="grid grid-cols-2 gap-3">
                                            <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                                    Area
                                                </div>
                                                <div class="mt-1 font-medium text-slate-900">
                                                    {booth().groupLabel}
                                                </div>
                                            </div>
                                            <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                                    Booth Type
                                                </div>
                                                <div class="mt-1 font-medium text-slate-900">
                                                    {formatBoothKind(booth())}
                                                </div>
                                            </div>
                                        </div>

                                        <div class="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                            <div>
                                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                                    Section
                                                </div>
                                                <div class="mt-1 font-medium text-slate-900">
                                                    {booth().section}
                                                </div>
                                            </div>
                                            <div>
                                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                                    Exhibitor
                                                </div>
                                                <div class="mt-1 font-medium text-slate-900">
                                                    {booth().vendor ??
                                                        "Open booth"}
                                                </div>
                                            </div>
                                            <div>
                                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                                    Notes
                                                </div>
                                                <div class="mt-1 text-slate-700">
                                                    {booth().note}
                                                </div>
                                            </div>
                                        </div>

                                        <div class="flex flex-wrap gap-2">
                                            <button
                                                class="rounded-full bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cyan-400"
                                                onClick={assignSelectedToStart}
                                            >
                                                Set as start
                                            </button>
                                            <button
                                                class="rounded-full bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-400"
                                                onClick={assignSelectedToEnd}
                                            >
                                                Set as destination
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </Show>
                        </section>

                        <section class="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                        Route Preview
                                    </p>
                                    <h3 class="text-lg font-semibold text-slate-950">
                                        Predefined aisle anchors
                                    </h3>
                                </div>
                                <button
                                    class="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                                    onClick={swapRoute}
                                >
                                    Swap
                                </button>
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                    <div class="text-xs uppercase tracking-wide text-slate-500">
                                        From
                                    </div>
                                    <div class="mt-1 text-base font-medium text-slate-900">
                                        {startBooth()?.code ?? "Not set"}
                                    </div>
                                </div>
                                <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                    <div class="text-xs uppercase tracking-wide text-slate-500">
                                        To
                                    </div>
                                    <div class="mt-1 text-base font-medium text-slate-900">
                                        {endBooth()?.code ?? "Not set"}
                                    </div>
                                </div>
                            </div>

                            <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                <div class="text-xs uppercase tracking-wide text-slate-500">
                                    Routing Model
                                </div>
                                <p class="mt-1 text-sm text-slate-700">
                                    The line exits each booth to its nearest
                                    aisle edge, climbs to a row corridor, then
                                    traverses one of the main vertical aisles.
                                </p>
                                <Show when={routePoints().length > 0}>
                                    <p class="mt-2 text-sm font-medium text-slate-900">
                                        Approx. walking distance:{" "}
                                        {routeDistance()} px-equivalent units
                                    </p>
                                </Show>
                            </div>
                        </section>

                        <section class="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Legend
                            </p>
                            <div class="flex flex-wrap gap-2 text-sm">
                                <span class="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
                                    Available
                                </span>
                                <span class="rounded-full bg-amber-100 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
                                    Reserved
                                </span>
                                <span class="rounded-full bg-rose-100 px-3 py-1 text-rose-700 ring-1 ring-rose-200">
                                    Occupied
                                </span>
                                <span class="rounded-full bg-cyan-100 px-3 py-1 text-cyan-700 ring-1 ring-cyan-200">
                                    Route start
                                </span>
                                <span class="rounded-full bg-violet-100 px-3 py-1 text-violet-700 ring-1 ring-violet-200">
                                    Route end
                                </span>
                            </div>
                            <p class="text-sm text-slate-600">
                                This prototype is optimized around wayfinding
                                first: the map keeps a predictable booth grid,
                                visible corridor structure, and persistent
                                detail panel instead of relying only on raw pan
                                and zoom.
                            </p>
                        </section>
                    </div>
                </aside>
            </div>
        </main>
    );
}
