import type { MapTheme } from "../../lib/map-themes";
import SidebarNightMarket from "./SidebarNightMarket";

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
    return <SidebarNightMarket {...props} />;
}
