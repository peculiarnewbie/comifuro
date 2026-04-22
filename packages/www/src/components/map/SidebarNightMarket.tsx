import { For, Show, createMemo, createSignal } from "solid-js";
import type { MapTheme } from "../../lib/map-themes";
import {
    floorPlan,
    boothSearchIndex,
    normalizeSearchValue,
    getBoothSearchScore,
    routeDistance,
    buildRoutePoints,
    SEARCH_RESULT_LIMIT,
    type Booth,
} from "../../lib/map-data";

export default function SidebarNightMarket(props: {
    theme: MapTheme;
    selectedBoothId: string | null;
    startBoothId: string | null;
    endBoothId: string | null;
    onSelectBooth: (id: string) => void;
    onSetStart: (id: string) => void;
    onSetEnd: (id: string) => void;
    onSwapRoute: () => void;
    onFocusBooth: (id: string) => void;
}) {
    const [searchQuery, setSearchQuery] = createSignal("");
    const [mobileOpen, setMobileOpen] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal<"search" | "booth" | "route">("search");

    const selectedBooth = createMemo(
        () => floorPlan.boothById.get(props.selectedBoothId ?? "") ?? null,
    );
    const startBooth = createMemo(
        () => floorPlan.boothById.get(props.startBoothId ?? "") ?? null,
    );
    const endBooth = createMemo(
        () => floorPlan.boothById.get(props.endBoothId ?? "") ?? null,
    );
    const routePoints = createMemo(() =>
        buildRoutePoints(startBooth(), endBooth(), floorPlan.mainAisleXs),
    );
    const dist = createMemo(() => routeDistance(routePoints()));

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

    const theme = createMemo(() => props.theme);

    const tabButton = (key: "search" | "booth" | "route", icon: string) => (
        <button
            class="flex h-12 w-12 items-center justify-center text-lg transition"
            style={{
                background: activeTab() === key ? "rgba(34,211,238,0.15)" : "transparent",
                color: activeTab() === key ? "#22d3ee" : "#64748b",
                "border-left": activeTab() === key ? "2px solid #22d3ee" : "2px solid transparent",
            }}
            onClick={() => setActiveTab(key)}
        >
            {icon}
        </button>
    );

    const glowText = (color: string) => ({
        color,
        "text-shadow": `0 0 12px ${color}40`,
    });

    return (
        <>
            <button
                class="absolute left-4 top-4 z-20 flex h-10 items-center gap-2 px-3 lg:hidden"
                style={{
                    background: "rgba(15,23,42,0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    "border-radius": "6px",
                    color: "#e2e8f0",
                    "backdrop-filter": "blur(8px)",
                }}
                onClick={() => setMobileOpen((v) => !v)}
            >
                <span>☰</span>
            </button>

            <aside
                class="fixed inset-y-0 right-0 z-30 flex h-full w-[340px] transition-transform lg:static lg:translate-x-0"
                classList={{
                    "translate-x-0": mobileOpen(),
                    "translate-x-full": !mobileOpen(),
                }}
                style={{
                    background: "#080c14",
                    "border-left": "1px solid rgba(255,255,255,0.06)",
                    "font-family": theme().fonts.body,
                }}
            >
                {/* Vertical tab rail */}
                <div
                    class="flex shrink-0 flex-col items-center gap-1 py-4"
                    style={{
                        width: "52px",
                        background: "rgba(255,255,255,0.02)",
                        "border-left": "1px solid rgba(255,255,255,0.06)",
                    }}
                >
                    <div class="mb-2 text-xs font-bold tracking-widest" style={{ color: "#334155" }}>
                        NAV
                    </div>
                    {tabButton("search", "🔍")}
                    {tabButton("booth", "📍")}
                    {tabButton("route", "🛣️")}
                </div>

                {/* Content panel */}
                <div class="min-w-0 flex-1 overflow-y-auto">
                    <div class="flex items-center justify-end p-3 lg:hidden">
                        <button
                            class="text-lg"
                            style={{ color: "#64748b" }}
                            onClick={() => setMobileOpen(false)}
                        >
                            ✕
                        </button>
                    </div>

                    <div class="px-5 py-4">
                        {/* SEARCH TAB */}
                        <Show when={activeTab() === "search"}>
                            <div class="mb-6">
                                <h2
                                    class="mb-1 text-2xl font-bold"
                                    style={{ ...glowText("#e2e8f0"), "font-family": theme().fonts.display }}
                                >
                                    Find Booth
                                </h2>
                                <p class="text-xs" style={{ color: "#475569" }}>
                                    {floorPlan.booths.length} booths indexed
                                </p>
                            </div>

                            <input
                                type="search"
                                value={searchQuery()}
                                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                                placeholder="E-31a, Pixel Lantern..."
                                class="mb-4 w-full px-3 py-2.5 text-sm outline-none"
                                style={{
                                    background: "rgba(255,255,255,0.04)",
                                    color: "#e2e8f0",
                                    "border-radius": "4px",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                }}
                            />

                            <Show when={searchQuery().trim().length > 0}>
                                <Show
                                    when={searchResults().length > 0}
                                    fallback={
                                        <p class="text-sm" style={{ color: "#475569" }}>
                                            No match for "{searchQuery().trim()}"
                                        </p>
                                    }
                                >
                                    <div class="space-y-1">
                                        <For each={searchResults()}>
                                            {(booth) => {
                                                const isSelected =
                                                    props.selectedBoothId === booth.id;
                                                return (
                                                    <button
                                                        class="flex w-full items-center justify-between px-3 py-2 text-left transition"
                                                style={{
                                                    background: isSelected
                                                        ? "rgba(34,211,238,0.1)"
                                                        : "transparent",
                                                    "border-radius": "4px",
                                                    "border": isSelected
                                                        ? "1px solid rgba(34,211,238,0.3)"
                                                        : "1px solid transparent",
                                                }}
                                                        onClick={() => {
                                                            props.onFocusBooth(booth.id);
                                                            setMobileOpen(false);
                                                        }}
                                                    >
                                                        <span
                                                            class="font-mono text-sm font-semibold"
                                                            style={{
                                                                color: isSelected ? "#22d3ee" : "#94a3b8",
                                                                "font-family": theme().fonts.mono,
                                                            }}
                                                        >
                                                            {booth.code}
                                                        </span>
                                                        <StatusDot status={booth.status} />
                                                    </button>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            </Show>

                            <div class="mt-8">
                                <h3 class="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: "#334155" }}>
                                    Quick Picks
                                </h3>
                                <div class="flex flex-wrap gap-2">
                                    <QuickChip label="Available" color="#10b981" onClick={() => {}} />
                                    <QuickChip label="Reserved" color="#f59e0b" onClick={() => {}} />
                                    <QuickChip label="Occupied" color="#f43f5e" onClick={() => {}} />
                                </div>
                            </div>
                        </Show>

                        {/* BOOTH TAB */}
                        <Show when={activeTab() === "booth"}>
                            <Show
                                when={selectedBooth()}
                                fallback={
                                    <div class="flex h-64 flex-col items-center justify-center gap-3">
                                        <div class="text-4xl" style={{ opacity: 0.2 }}>📍</div>
                                        <p class="text-sm" style={{ color: "#475569" }}>
                                            Select a booth on the map
                                        </p>
                                    </div>
                                }
                            >
                                {(booth) => (
                                    <div class="space-y-5">
                                        <div>
                                            <div
                                                class="text-5xl font-bold tracking-tighter"
                                                style={{
                                                    ...glowText("#e2e8f0"),
                                                    "font-family": theme().fonts.display,
                                                }}
                                            >
                                                {booth().code}
                                            </div>
                                            <div class="mt-2 flex items-center gap-3">
                                                <StatusLine status={booth().status} />
                                                <span class="text-sm" style={{ color: "#64748b" }}>
                                                    {booth().groupLabel}
                                                </span>
                                            </div>
                                        </div>

                                        <div class="space-y-3">
                                            <DataRow label="Section" value={booth().section} />
                                            <DataRow
                                                label="Exhibitor"
                                                value={booth().vendor ?? "—"}
                                            />
                                            <DataRow
                                                label="Note"
                                                value={booth().note}
                                                muted
                                            />
                                        </div>

                                        <div class="flex gap-2">
                                            <ActionButton
                                                color="#0891b2"
                                                label="Set Start"
                                                onClick={() => props.onSetStart(booth().id)}
                                            />
                                            <ActionButton
                                                color="#7c3aed"
                                                label="Set End"
                                                onClick={() => props.onSetEnd(booth().id)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </Show>
                        </Show>

                        {/* ROUTE TAB */}
                        <Show when={activeTab() === "route"}>
                            <div class="mb-6">
                                <h2
                                    class="text-2xl font-bold"
                                    style={{ ...glowText("#e2e8f0"), "font-family": theme().fonts.display }}
                                >
                                    Route
                                </h2>
                            </div>

                            <div class="space-y-3">
                                <RouteNode
                                    label="START"
                                    booth={startBooth()}
                                    color="#0891b2"
                                    emptyText="Not set"
                                />
                                    <div
                                        class="ml-5 h-6 border-l border-dashed"
                                        style={{ "border-color": "rgba(255,255,255,0.1)" }}
                                    />
                                <RouteNode
                                    label="END"
                                    booth={endBooth()}
                                    color="#7c3aed"
                                    emptyText="Not set"
                                />
                            </div>

                            <Show when={routePoints().length > 0}>
                                <div
                                    class="mt-5 px-4 py-3"
                                    style={{
                                        background: "rgba(255,255,255,0.03)",
                                        "border-radius": "4px",
                                        border: "1px solid rgba(255,255,255,0.06)",
                                    }}
                                >
                                    <div class="text-xs uppercase tracking-widest" style={{ color: "#475569" }}>
                                        Distance
                                    </div>
                                    <div class="mt-1 text-2xl font-bold" style={{ color: "#e2e8f0", "font-family": theme().fonts.display }}>
                                        {dist()} <span class="text-sm font-normal" style={{ color: "#64748b" }}>units</span>
                                    </div>
                                </div>
                            </Show>

                            <button
                                class="mt-4 w-full py-2 text-sm transition hover:opacity-80"
                                style={{
                                    background: "rgba(255,255,255,0.04)",
                                    color: "#94a3b8",
                                    "border-radius": "4px",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                }}
                                onClick={props.onSwapRoute}
                            >
                                Swap direction
                            </button>
                        </Show>
                    </div>
                </div>
            </aside>

            <Show when={mobileOpen()}>
                <div
                    class="fixed inset-0 z-20 bg-black/60 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            </Show>
        </>
    );
}

function StatusDot(props: { status: "available" | "reserved" | "occupied" }) {
    const color =
        props.status === "available"
            ? "#10b981"
            : props.status === "reserved"
              ? "#f59e0b"
              : "#f43f5e";
    return (
        <span
            class="h-2 w-2 rounded-full"
            style={{ background: color, "box-shadow": `0 0 6px ${color}` }}
        />
    );
}

function StatusLine(props: { status: "available" | "reserved" | "occupied" }) {
    const color =
        props.status === "available"
            ? "#10b981"
            : props.status === "reserved"
              ? "#f59e0b"
              : "#f43f5e";
    return (
        <span
            class="h-px w-8"
            style={{ background: color, "box-shadow": `0 0 8px ${color}` }}
        />
    );
}

function DataRow(props: { label: string; value: string; muted?: boolean }) {
    return (
        <div
            class="flex items-baseline justify-between gap-3 border-b py-2"
            style={{ "border-color": "rgba(255,255,255,0.04)" }}
        >
            <span class="text-xs uppercase tracking-widest" style={{ color: "#475569" }}>
                {props.label}
            </span>
            <span
                class="text-right text-sm"
                style={{ color: props.muted ? "#64748b" : "#e2e8f0" }}
            >
                {props.value}
            </span>
        </div>
    );
}

function ActionButton(props: {
    color: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            class="flex-1 py-2 text-sm font-medium transition hover:opacity-90"
            style={{
                background: `${props.color}20`,
                color: props.color,
                "border-radius": "4px",
                border: `1px solid ${props.color}40`,
            }}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}

function RouteNode(props: {
    label: string;
    booth: Booth | null;
    color: string;
    emptyText: string;
}) {
    return (
        <div class="flex items-center gap-3">
            <div
                class="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold"
                style={{
                    background: `${props.color}20`,
                    color: props.color,
                    "border-radius": "4px",
                    border: `1px solid ${props.color}40`,
                }}
            >
                {props.label[0]}
            </div>
            <div>
                <div class="text-[10px] uppercase tracking-widest" style={{ color: "#475569" }}>
                    {props.label}
                </div>
                <div class="font-mono text-sm font-semibold" style={{ color: props.booth ? "#e2e8f0" : "#475569" }}>
                    {props.booth?.code ?? props.emptyText}
                </div>
            </div>
        </div>
    );
}

function QuickChip(props: {
    label: string;
    color: string;
    onClick: () => void;
}) {
    return (
        <button
            class="px-3 py-1 text-xs transition hover:opacity-80"
            style={{
                background: `${props.color}15`,
                color: props.color,
                "border-radius": "4px",
                border: `1px solid ${props.color}30`,
            }}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}
