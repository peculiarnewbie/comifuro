import { For, Show, createMemo, createSignal } from "solid-js";
import type { MapTheme, BoothStatus } from "../../lib/map-themes";
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

export default function Sidebar(props: {
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

    const t = props.theme;

    function statusBadgeClasses(status: BoothStatus) {
        if (status === "available")
            return { bg: t.ui.badgeAvailable, text: t.ui.badgeAvailableText };
        if (status === "reserved")
            return { bg: t.ui.badgeReserved, text: t.ui.badgeReservedText };
        return { bg: t.ui.badgeOccupied, text: t.ui.badgeOccupiedText };
    }

    return (
        <>
            {/* Mobile toggle */}
            <button
                class="absolute left-4 top-4 z-20 flex h-10 items-center gap-2 px-3 lg:hidden"
                style={{
                    background: t.ui.panelBg,
                    border: `1px solid ${t.ui.panelBorder}`,
                    "border-radius": t.ui.panelRadius,
                    color: t.ui.textMain,
                    "box-shadow": t.ui.shadow,
                }}
                onClick={() => setMobileOpen((v) => !v)}
            >
                <span class="text-lg">☰</span>
                <span class="text-sm font-medium">Menu</span>
            </button>

            <aside
                class="h-full shrink-0 overflow-y-auto transition-transform lg:static lg:translate-x-0"
                classList={{
                    "fixed inset-y-0 left-0 z-30 w-[340px] translate-x-0": mobileOpen(),
                    "fixed inset-y-0 left-0 z-30 w-[340px] -translate-x-full": !mobileOpen(),
                    "lg:w-[360px] xl:w-[380px]": true,
                }}
                style={{
                    background: t.ui.sidebarBg,
                    "border-right": `1px solid ${t.ui.sidebarBorder}`,
                }}
            >
                {/* Close button for mobile */}
                <div class="flex items-center justify-end p-3 lg:hidden">
                    <button
                        class="flex h-8 w-8 items-center justify-center text-lg"
                        style={{ color: t.ui.textMuted }}
                        onClick={() => setMobileOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div
                    class="flex min-h-full flex-col gap-4 p-4 lg:p-5"
                    style={{ "font-family": t.fonts.body }}
                >
                    {/* Search */}
                    <div
                        class="space-y-3 p-4"
                        style={{
                            background: t.ui.panelBg,
                            border: `1px solid ${t.ui.panelBorder}`,
                            "border-radius": t.ui.panelRadius,
                            "box-shadow": t.ui.shadow,
                        }}
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p
                                    class="text-xs font-semibold uppercase tracking-widest"
                                    style={{ color: t.ui.textMuted }}
                                >
                                    Booth Search
                                </p>
                                <h2
                                    class="text-lg font-semibold"
                                    style={{
                                        color: t.ui.textMain,
                                        "font-family": t.fonts.display,
                                    }}
                                >
                                    Jump to a booth
                                </h2>
                            </div>
                            <span
                                class="shrink-0 px-2.5 py-1 text-xs"
                                style={{
                                    background:
                                        t.id === "night-market"
                                            ? "rgba(255,255,255,0.1)"
                                            : t.ui.inputBg,
                                    color: t.ui.textMuted,
                                    "border-radius": "9999px",
                                    border:
                                        t.id === "night-market"
                                            ? "1px solid rgba(255,255,255,0.1)"
                                            : `1px solid ${t.ui.inputBorder}`,
                                }}
                            >
                                {floorPlan.booths.length} total
                            </span>
                        </div>

                        <input
                            type="search"
                            value={searchQuery()}
                            onInput={(event) =>
                                setSearchQuery(event.currentTarget.value)
                            }
                            placeholder="Search booth code, exhibitor, or hall"
                            class="w-full px-3 py-2.5 text-sm outline-none transition"
                            style={{
                                background: t.ui.inputBg,
                                color: t.ui.textMain,
                                "border-radius": t.ui.panelRadius,
                                border: `1px solid ${t.ui.inputBorder}`,
                            }}
                        />

                        <div class="space-y-2">
                            <Show
                                when={searchQuery().trim().length > 0}
                                fallback={
                                    <p
                                        class="px-3 py-2.5 text-sm"
                                        style={{
                                            color: t.ui.textMuted,
                                            background:
                                                t.id === "night-market"
                                                    ? "rgba(255,255,255,0.05)"
                                                    : t.ui.inputBg,
                                            "border-radius": t.ui.panelRadius,
                                            border:
                                                t.id === "night-market"
                                                    ? "1px solid rgba(255,255,255,0.05)"
                                                    : `1px solid ${t.ui.inputBorder}`,
                                        }}
                                    >
                                        Search by booth code or exhibitor name.
                                    </p>
                                }
                            >
                                <Show
                                    when={searchResults().length > 0}
                                    fallback={
                                        <p
                                            class="px-3 py-2.5 text-sm"
                                            style={{
                                                color: t.ui.textMuted,
                                                background:
                                                    t.id === "night-market"
                                                        ? "rgba(255,255,255,0.05)"
                                                        : t.ui.inputBg,
                                                "border-radius":
                                                    t.ui.panelRadius,
                                                border:
                                                    t.id === "night-market"
                                                        ? "1px solid rgba(255,255,255,0.05)"
                                                        : `1px solid ${t.ui.inputBorder}`,
                                            }}
                                        >
                                            No booths matched "
                                            {searchQuery().trim()}".
                                        </p>
                                    }
                                >
                                    <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
                                        <For each={searchResults()}>
                                            {(booth) => {
                                                const isSelected =
                                                    props.selectedBoothId ===
                                                    booth.id;
                                                const badge =
                                                    statusBadgeClasses(
                                                        booth.status,
                                                    );
                                                return (
                                                    <button
                                                        class="block w-full px-3 py-2.5 text-left transition"
                                                        style={{
                                                            background:
                                                                isSelected
                                                                    ? t.ui.accent
                                                                    : t.id ===
                                                                        "night-market"
                                                                      ? "rgba(255,255,255,0.05)"
                                                                      : t.ui
                                                                            .inputBg,
                                                            color: isSelected
                                                                ? t.ui
                                                                    .textInverse
                                                                : t.ui.textMain,
                                                            "border-radius":
                                                                t.ui.panelRadius,
                                                            border: isSelected
                                                                ? `1px solid ${t.ui.accent}`
                                                                : t.id ===
                                                                    "night-market"
                                                                  ? "1px solid rgba(255,255,255,0.05)"
                                                                  : `1px solid ${t.ui.inputBorder}`,
                                                        }}
                                                        onClick={() => {
                                                            props.onFocusBooth(
                                                                booth.id,
                                                            );
                                                            setMobileOpen(
                                                                false,
                                                            );
                                                        }}
                                                    >
                                                        <div class="flex items-center justify-between gap-3">
                                                            <div class="text-sm font-semibold">
                                                                {booth.code}
                                                            </div>
                                                            <span
                                                                class="px-2 py-0.5 text-[11px] font-medium"
                                                                style={{
                                                                    background:
                                                                        isSelected
                                                                            ? "rgba(255,255,255,0.2)"
                                                                            : badge.bg,
                                                                    color: isSelected
                                                                        ? "#fff"
                                                                        : badge.text,
                                                                    "border-radius":
                                                                        "9999px",
                                                                }}
                                                            >
                                                                {booth.status}
                                                            </span>
                                                        </div>
                                                        <div
                                                            class="mt-1 text-xs"
                                                            style={{
                                                                color: isSelected
                                                                    ? "rgba(255,255,255,0.7)"
                                                                    : t.ui
                                                                        .textMuted,
                                                            }}
                                                        >
                                                            {booth.vendor ??
                                                                "Unassigned booth"}{" "}
                                                            - {booth.groupLabel}
                                                        </div>
                                                    </button>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            </Show>
                        </div>
                    </div>

                    {/* Selected Booth */}
                    <div
                        class="space-y-3 p-4"
                        style={{
                            background: t.ui.panelBg,
                            border: `1px solid ${t.ui.panelBorder}`,
                            "border-radius": t.ui.panelRadius,
                            "box-shadow": t.ui.shadow,
                        }}
                    >
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <p
                                    class="text-xs font-semibold uppercase tracking-widest"
                                    style={{ color: t.ui.textMuted }}
                                >
                                    Selected Booth
                                </p>
                                <Show
                                    when={selectedBooth()}
                                    fallback={
                                        <h2
                                            class="text-lg font-semibold"
                                            style={{ color: t.ui.textMain }}
                                        >
                                            Pick any booth
                                        </h2>
                                    }
                                >
                                    {(booth) => (
                                        <h2
                                            class="text-2xl font-semibold tracking-tight"
                                            style={{
                                                color: t.ui.textMain,
                                                "font-family": t.fonts.display,
                                            }}
                                        >
                                            {booth().code}
                                        </h2>
                                    )}
                                </Show>
                            </div>
                            <Show when={selectedBooth()}>
                                {(booth) => {
                                    const badge = statusBadgeClasses(
                                        booth().status,
                                    );
                                    return (
                                        <span
                                            class="px-2.5 py-1 text-xs font-medium"
                                            style={{
                                                background: badge.bg,
                                                color: badge.text,
                                                "border-radius": "9999px",
                                            }}
                                        >
                                            {booth().status}
                                        </span>
                                    );
                                }}
                            </Show>
                        </div>

                        <Show
                            when={selectedBooth()}
                            fallback={
                                <p
                                    class="text-sm"
                                    style={{ color: t.ui.textMuted }}
                                >
                                    Click a booth on the map to inspect it, then
                                    set it as your start or destination.
                                </p>
                            }
                        >
                            {(booth) => (
                                <div
                                    class="space-y-3 text-sm"
                                    style={{ color: t.ui.textMain }}
                                >
                                    <div class="grid grid-cols-2 gap-3">
                                        <div
                                            class="p-3"
                                            style={{
                                                background:
                                                    t.id === "night-market"
                                                        ? "rgba(255,255,255,0.05)"
                                                        : t.ui.inputBg,
                                                "border-radius":
                                                    t.ui.panelRadius,
                                                border:
                                                    t.id === "night-market"
                                                        ? "1px solid rgba(255,255,255,0.05)"
                                                        : `1px solid ${t.ui.inputBorder}`,
                                            }}
                                        >
                                            <div
                                                class="text-xs uppercase tracking-wide"
                                                style={{
                                                    color: t.ui.textMuted,
                                                }}
                                            >
                                                Area
                                            </div>
                                            <div class="mt-1 font-medium">
                                                {booth().groupLabel}
                                            </div>
                                        </div>
                                        <div
                                            class="p-3"
                                            style={{
                                                background:
                                                    t.id === "night-market"
                                                        ? "rgba(255,255,255,0.05)"
                                                        : t.ui.inputBg,
                                                "border-radius":
                                                    t.ui.panelRadius,
                                                border:
                                                    t.id === "night-market"
                                                        ? "1px solid rgba(255,255,255,0.05)"
                                                        : `1px solid ${t.ui.inputBorder}`,
                                            }}
                                        >
                                            <div
                                                class="text-xs uppercase tracking-wide"
                                                style={{
                                                    color: t.ui.textMuted,
                                                }}
                                            >
                                                Section
                                            </div>
                                            <div class="mt-1 font-medium">
                                                {booth().section}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        class="space-y-2 p-3"
                                        style={{
                                            background:
                                                t.id === "night-market"
                                                    ? "rgba(255,255,255,0.05)"
                                                    : t.ui.inputBg,
                                            "border-radius": t.ui.panelRadius,
                                            border:
                                                t.id === "night-market"
                                                    ? "1px solid rgba(255,255,255,0.05)"
                                                    : `1px solid ${t.ui.inputBorder}`,
                                        }}
                                    >
                                        <div>
                                            <div
                                                class="text-xs uppercase tracking-wide"
                                                style={{
                                                    color: t.ui.textMuted,
                                                }}
                                            >
                                                Exhibitor
                                            </div>
                                            <div class="mt-1 font-medium">
                                                {booth().vendor ??
                                                    "Open booth"}
                                            </div>
                                        </div>
                                        <div>
                                            <div
                                                class="text-xs uppercase tracking-wide"
                                                style={{
                                                    color: t.ui.textMuted,
                                                }}
                                            >
                                                Notes
                                            </div>
                                            <div
                                                class="mt-1"
                                                style={{
                                                    color: t.ui.textMuted,
                                                }}
                                            >
                                                {booth().note}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="flex flex-wrap gap-2">
                                        <button
                                            class="px-3 py-1.5 text-sm font-medium transition hover:opacity-90"
                                            style={{
                                                background:
                                                    t.colors.startMarker,
                                                color: "#fff",
                                                "border-radius":
                                                    t.ui.panelRadius,
                                            }}
                                            onClick={() =>
                                                props.onSetStart(booth().id)
                                            }
                                        >
                                            Set as start
                                        </button>
                                        <button
                                            class="px-3 py-1.5 text-sm font-medium transition hover:opacity-90"
                                            style={{
                                                background: t.colors.endMarker,
                                                color: "#fff",
                                                "border-radius":
                                                    t.ui.panelRadius,
                                            }}
                                            onClick={() =>
                                                props.onSetEnd(booth().id)
                                            }
                                        >
                                            Set as destination
                                        </button>
                                    </div>
                                </div>
                            )}
                        </Show>
                    </div>

                    {/* Route Preview */}
                    <div
                        class="space-y-3 p-4"
                        style={{
                            background: t.ui.panelBg,
                            border: `1px solid ${t.ui.panelBorder}`,
                            "border-radius": t.ui.panelRadius,
                            "box-shadow": t.ui.shadow,
                        }}
                    >
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <p
                                    class="text-xs font-semibold uppercase tracking-widest"
                                    style={{ color: t.ui.textMuted }}
                                >
                                    Route Preview
                                </p>
                                <h3
                                    class="text-lg font-semibold"
                                    style={{ color: t.ui.textMain }}
                                >
                                    Wayfinding
                                </h3>
                            </div>
                            <button
                                class="px-3 py-1.5 text-sm font-medium transition hover:opacity-80"
                                style={{
                                    background: t.ui.buttonSecondaryBg,
                                    color: t.ui.buttonSecondaryText,
                                    border: `1px solid ${t.ui.buttonSecondaryBorder}`,
                                    "border-radius": t.ui.panelRadius,
                                }}
                                onClick={props.onSwapRoute}
                            >
                                Swap
                            </button>
                        </div>

                        <div class="grid gap-3">
                            <div
                                class="flex items-center gap-3 p-3"
                                style={{
                                    background:
                                        t.id === "night-market"
                                            ? "rgba(255,255,255,0.05)"
                                            : t.ui.inputBg,
                                    "border-radius": t.ui.panelRadius,
                                    border:
                                        t.id === "night-market"
                                            ? "1px solid rgba(255,255,255,0.05)"
                                            : `1px solid ${t.ui.inputBorder}`,
                                }}
                            >
                                <div
                                    class="h-8 w-8 shrink-0"
                                    style={{
                                        background: t.colors.startMarker,
                                        "border-radius":
                                            t.id === "playground"
                                                ? "9999px"
                                                : t.id === "art-deco"
                                                  ? "0"
                                                  : "4px",
                                    }}
                                />
                                <div>
                                    <div
                                        class="text-xs uppercase tracking-wide"
                                        style={{ color: t.ui.textMuted }}
                                    >
                                        From
                                    </div>
                                    <div
                                        class="text-base font-medium"
                                        style={{ color: t.ui.textMain }}
                                    >
                                        {startBooth()?.code ?? "Not set"}
                                    </div>
                                </div>
                            </div>
                            <div
                                class="flex items-center gap-3 p-3"
                                style={{
                                    background:
                                        t.id === "night-market"
                                            ? "rgba(255,255,255,0.05)"
                                            : t.ui.inputBg,
                                    "border-radius": t.ui.panelRadius,
                                    border:
                                        t.id === "night-market"
                                            ? "1px solid rgba(255,255,255,0.05)"
                                            : `1px solid ${t.ui.inputBorder}`,
                                }}
                            >
                                <div
                                    class="h-8 w-8 shrink-0"
                                    style={{
                                        background: t.colors.endMarker,
                                        "border-radius":
                                            t.id === "playground"
                                                ? "9999px"
                                                : t.id === "art-deco"
                                                  ? "0"
                                                  : "4px",
                                    }}
                                />
                                <div>
                                    <div
                                        class="text-xs uppercase tracking-wide"
                                        style={{ color: t.ui.textMuted }}
                                    >
                                        To
                                    </div>
                                    <div
                                        class="text-base font-medium"
                                        style={{ color: t.ui.textMain }}
                                    >
                                        {endBooth()?.code ?? "Not set"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Show when={routePoints().length > 0}>
                            <div
                                class="p-3"
                                style={{
                                    background:
                                        t.id === "night-market"
                                            ? "rgba(255,255,255,0.05)"
                                            : t.ui.inputBg,
                                    "border-radius": t.ui.panelRadius,
                                    border:
                                        t.id === "night-market"
                                            ? "1px solid rgba(255,255,255,0.05)"
                                            : `1px solid ${t.ui.inputBorder}`,
                                }}
                            >
                                <div
                                    class="text-xs uppercase tracking-wide"
                                    style={{ color: t.ui.textMuted }}
                                >
                                    Walking distance
                                </div>
                                <div
                                    class="mt-1 text-xl font-semibold"
                                    style={{
                                        color: t.ui.textMain,
                                        "font-family": t.fonts.display,
                                    }}
                                >
                                    {dist()} units
                                </div>
                            </div>
                        </Show>
                    </div>

                    {/* Legend */}
                    <div
                        class="space-y-3 p-4"
                        style={{
                            background: t.ui.panelBg,
                            border: `1px solid ${t.ui.panelBorder}`,
                            "border-radius": t.ui.panelRadius,
                            "box-shadow": t.ui.shadow,
                        }}
                    >
                        <p
                            class="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: t.ui.textMuted }}
                        >
                            Legend
                        </p>
                        <div class="flex flex-wrap gap-2 text-sm">
                            <LegendChip
                                label="Available"
                                bg={t.ui.badgeAvailable}
                                text={t.ui.badgeAvailableText}
                                radius={t.ui.panelRadius}
                            />
                            <LegendChip
                                label="Reserved"
                                bg={t.ui.badgeReserved}
                                text={t.ui.badgeReservedText}
                                radius={t.ui.panelRadius}
                            />
                            <LegendChip
                                label="Occupied"
                                bg={t.ui.badgeOccupied}
                                text={t.ui.badgeOccupiedText}
                                radius={t.ui.panelRadius}
                            />
                        </div>
                        <p
                            class="text-sm leading-relaxed"
                            style={{ color: t.ui.textMuted }}
                        >
                            Scroll or drag to pan. Pinch or Ctrl/Cmd + scroll to
                            zoom. Select a booth to set waypoints.
                        </p>
                    </div>
                </div>
            </aside>

            {/* Mobile overlay */}
            <Show when={mobileOpen()}>
                <div
                    class="fixed inset-0 z-20 bg-black/40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            </Show>
        </>
    );
}

function LegendChip(props: {
    label: string;
    bg: string;
    text: string;
    radius: string;
}) {
    return (
        <span
            class="px-3 py-1 text-sm font-medium"
            style={{
                background: props.bg,
                color: props.text,
                "border-radius": props.radius,
            }}
        >
            {props.label}
        </span>
    );
}
