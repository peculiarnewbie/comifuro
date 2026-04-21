import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, createMemo } from "solid-js";
import MapCanvas from "../components/map/MapCanvas";
import Sidebar from "../components/map/Sidebar";
import ThemeSwitcher from "../components/map/ThemeSwitcher";
import {
    type ThemeKey,
    DEFAULT_THEME,
    getTheme,
} from "../lib/map-themes";
import {
    floorPlan,
    buildRoutePoints,
    routeDistance,
    DEFAULT_SELECTED_BOOTH,
    DEFAULT_START_BOOTH,
    DEFAULT_END_BOOTH,
} from "../lib/map-data";

export const Route = createFileRoute("/map")({
    component: RouteComponent,
});

function RouteComponent() {
    const [themeKey, setThemeKey] = createSignal<ThemeKey>(DEFAULT_THEME);
    const theme = createMemo(() => getTheme(themeKey()));

    const [selectedBoothId, setSelectedBoothId] = createSignal<string | null>(
        DEFAULT_SELECTED_BOOTH,
    );
    const [startBoothId, setStartBoothId] = createSignal<string | null>(
        DEFAULT_START_BOOTH,
    );
    const [endBoothId, setEndBoothId] = createSignal<string | null>(
        DEFAULT_END_BOOTH,
    );
    const [focusRequest, setFocusRequest] = createSignal<{
        boothId: string;
        scale?: number;
    } | null>(null);

    const startBooth = createMemo(
        () => floorPlan.boothById.get(startBoothId() ?? "") ?? null,
    );
    const endBooth = createMemo(
        () => floorPlan.boothById.get(endBoothId() ?? "") ?? null,
    );
    const routePoints = createMemo(() =>
        buildRoutePoints(startBooth(), endBooth(), floorPlan.mainAisleXs),
    );
    const routeDist = createMemo(() => routeDistance(routePoints()));

    function handleSelectBooth(id: string) {
        setSelectedBoothId(id);
    }

    function handleClearSelection() {
        setSelectedBoothId(null);
    }

    function handleSetStart(id: string) {
        setStartBoothId(id);
    }

    function handleSetEnd(id: string) {
        setEndBoothId(id);
    }

    function handleSwapRoute() {
        const start = startBoothId();
        const end = endBoothId();
        setStartBoothId(end);
        setEndBoothId(start);
    }

    function handleFocusBooth(id: string) {
        setSelectedBoothId(id);
        setFocusRequest({ boothId: id, scale: 2.2 });
    }

    function handleFocusConsumed() {
        setFocusRequest(null);
    }

    const t = theme();

    return (
        <main
            class="h-screen w-screen overflow-hidden"
            style={{
                background: t.ui.pageBg,
                color: t.ui.textMain,
                "font-family": t.fonts.body,
            }}
        >
            <div class="flex h-full w-full">
                <Sidebar
                    theme={t}
                    selectedBoothId={selectedBoothId()}
                    startBoothId={startBoothId()}
                    endBoothId={endBoothId()}
                    onSelectBooth={handleSelectBooth}
                    onSetStart={handleSetStart}
                    onSetEnd={handleSetEnd}
                    onSwapRoute={handleSwapRoute}
                    onFocusBooth={handleFocusBooth}
                />
                <MapCanvas
                    theme={t}
                    selectedBoothId={selectedBoothId()}
                    startBoothId={startBoothId()}
                    endBoothId={endBoothId()}
                    focusRequest={focusRequest()}
                    onSelectBooth={handleSelectBooth}
                    onClearSelection={handleClearSelection}
                    onFocusConsumed={handleFocusConsumed}
                />
                <ThemeSwitcher
                    theme={t}
                    current={themeKey()}
                    onChange={setThemeKey}
                />
            </div>
        </main>
    );
}
