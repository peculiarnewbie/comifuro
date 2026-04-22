export type BoothStatus = "available" | "reserved" | "occupied";

export type MapTheme = {
    name: string;
    icon: string;
    fonts: {
        display: string;
        body: string;
        mono: string;
    };
    colors: {
        background: string;
        mapBg: string;
        mapGrid: string;
        aisleLine: string;
        aisleLabel: string;
        stackOutline: string;
        stackFill: string;
        sectionPillBg: string;
        sectionPillText: string;
        sectionPillBorder: string;
        boothText: string;
        boothStroke: string;
        boothStrokeSelected: string;
        boothStrokeStart: string;
        boothStrokeEnd: string;
        boothFill: {
            available: string;
            reserved: string;
            occupied: string;
        };
        boothFillSelected: string;
        boothFillStart: string;
        boothFillEnd: string;
        routeLine: string;
        routeDot: string;
        startMarker: string;
        endMarker: string;
        hallLabel: string;
        hallLine: string;
    };
    ui: {
        pageBg: string;
        sidebarBg: string;
        sidebarBorder: string;
        panelBg: string;
        panelBorder: string;
        panelRadius: string;
        textMain: string;
        textMuted: string;
        textInverse: string;
        accent: string;
        badgeAvailable: string;
        badgeAvailableText: string;
        badgeReserved: string;
        badgeReservedText: string;
        badgeOccupied: string;
        badgeOccupiedText: string;
        inputBg: string;
        inputBorder: string;
        buttonPrimaryBg: string;
        buttonPrimaryText: string;
        buttonSecondaryBg: string;
        buttonSecondaryText: string;
        buttonSecondaryBorder: string;
        shadow: string;
    };
};

export const NIGHT_MARKET_THEME: MapTheme = {
    name: "Night Market",
    icon: "🌙",
    fonts: {
        display: "'Space Grotesk', sans-serif",
        body: "'Space Grotesk', sans-serif",
        mono: "'JetBrains Mono', monospace",
    },
    colors: {
        background: "#080c14",
        mapBg: "#0a0f1a",
        mapGrid: "#111827",
        aisleLine: "#1f2937",
        aisleLabel: "#4b5563",
        stackOutline: "#374151",
        stackFill: "#0f172a",
        sectionPillBg: "#1e293b",
        sectionPillText: "#e2e8f0",
        sectionPillBorder: "#334155",
        boothText: "#cbd5e1",
        boothStroke: "#334155",
        boothStrokeSelected: "#22d3ee",
        boothStrokeStart: "#06b6d4",
        boothStrokeEnd: "#a78bfa",
        boothFill: {
            available: "#064e3b",
            reserved: "#78350f",
            occupied: "#7f1d1d",
        },
        boothFillSelected: "#1e3a5f",
        boothFillStart: "#164e63",
        boothFillEnd: "#4c1d95",
        routeLine: "#22d3ee",
        routeDot: "#22d3ee",
        startMarker: "#06b6d4",
        endMarker: "#a78bfa",
        hallLabel: "#9ca3af",
        hallLine: "#1f2937",
    },
    ui: {
        pageBg: "#080c14",
        sidebarBg: "#0f172a",
        sidebarBorder: "#1e293b",
        panelBg: "#111827",
        panelBorder: "#1f2937",
        panelRadius: "0.75rem",
        textMain: "#f1f5f9",
        textMuted: "#94a3b8",
        textInverse: "#0f172a",
        accent: "#22d3ee",
        badgeAvailable: "#065f46",
        badgeAvailableText: "#34d399",
        badgeReserved: "#92400e",
        badgeReservedText: "#fbbf24",
        badgeOccupied: "#991b1b",
        badgeOccupiedText: "#f87171",
        inputBg: "#1e293b",
        inputBorder: "#334155",
        buttonPrimaryBg: "#22d3ee",
        buttonPrimaryText: "#0f172a",
        buttonSecondaryBg: "#1e293b",
        buttonSecondaryText: "#e2e8f0",
        buttonSecondaryBorder: "#334155",
        shadow: "0 4px 24px rgba(0,0,0,0.5)",
    },
};

export function statusLabel(status: BoothStatus): string {
    return status;
}
