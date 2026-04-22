import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import MapCanvas from "../components/map/MapCanvas";
import Sidebar from "../components/map/Sidebar";
import { NIGHT_MARKET_THEME } from "../lib/map-themes";
import {
    floorPlan,
    DEFAULT_SELECTED_BOOTH,
    DEFAULT_START_BOOTH,
    DEFAULT_END_BOOTH,
} from "../lib/map-data";

const theme = NIGHT_MARKET_THEME;

export const Route = createFileRoute("/map")({
    component: RouteComponent,
});

function RouteComponent() {
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

    return (
        <main
            class="relative h-screen w-screen overflow-hidden"
            style={{
                background: theme.ui.pageBg,
                color: theme.ui.textMain,
                "font-family": theme.fonts.body,
            }}
        >
            <div class="flex h-full w-full">
                <MapCanvas
                    theme={theme}
                    selectedBoothId={selectedBoothId()}
                    startBoothId={startBoothId()}
                    endBoothId={endBoothId()}
                    focusRequest={focusRequest()}
                    onSelectBooth={handleSelectBooth}
                    onClearSelection={handleClearSelection}
                    onFocusConsumed={handleFocusConsumed}
                />
                <Sidebar
                    theme={theme}
                    selectedBoothId={selectedBoothId()}
                    startBoothId={startBoothId()}
                    endBoothId={endBoothId()}
                    onSelectBooth={handleSelectBooth}
                    onSetStart={handleSetStart}
                    onSetEnd={handleSetEnd}
                    onSwapRoute={handleSwapRoute}
                    onFocusBooth={handleFocusBooth}
                />
            </div>
        </main>
    );
}
