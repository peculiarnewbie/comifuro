export type ThemeKey = "night-market" | "art-deco" | "playground";

export type BoothStatus = "available" | "reserved" | "occupied";

export type MapTheme = {
    id: ThemeKey;
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

export const THEMES: Record<ThemeKey, MapTheme> = {
    "night-market": {
        id: "night-market",
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
    },
    "art-deco": {
        id: "art-deco",
        name: "Art Deco",
        icon: "✦",
        fonts: {
            display: "'Playfair Display', serif",
            body: "'Source Serif 4', serif",
            mono: "'JetBrains Mono', monospace",
        },
        colors: {
            background: "#faf6f1",
            mapBg: "#f5f0e8",
            mapGrid: "#e8e0d4",
            aisleLine: "#d4c4b0",
            aisleLabel: "#a89f91",
            stackOutline: "#c4b5a0",
            stackFill: "#faf6f1",
            sectionPillBg: "#1a1a1a",
            sectionPillText: "#f5f0e8",
            sectionPillBorder: "#1a1a1a",
            boothText: "#2d2a26",
            boothStroke: "#a89f91",
            boothStrokeSelected: "#b45309",
            boothStrokeStart: "#0f766e",
            boothStrokeEnd: "#7c3aed",
            boothFill: {
                available: "#d1fae5",
                reserved: "#fef3c7",
                occupied: "#ffe4e6",
            },
            boothFillSelected: "#bae6fd",
            boothFillStart: "#ccfbf1",
            boothFillEnd: "#ede9fe",
            routeLine: "#1a1a1a",
            routeDot: "#b45309",
            startMarker: "#0f766e",
            endMarker: "#7c3aed",
            hallLabel: "#8c8273",
            hallLine: "#d4c4b0",
        },
        ui: {
            pageBg: "#faf6f1",
            sidebarBg: "#ffffff",
            sidebarBorder: "#e8e0d4",
            panelBg: "#ffffff",
            panelBorder: "#e8e0d4",
            panelRadius: "0.125rem",
            textMain: "#1c1917",
            textMuted: "#78716c",
            textInverse: "#faf6f1",
            accent: "#b45309",
            badgeAvailable: "#d1fae5",
            badgeAvailableText: "#065f46",
            badgeReserved: "#fef3c7",
            badgeReservedText: "#92400e",
            badgeOccupied: "#ffe4e6",
            badgeOccupiedText: "#9f1239",
            inputBg: "#ffffff",
            inputBorder: "#d4c4b0",
            buttonPrimaryBg: "#1a1a1a",
            buttonPrimaryText: "#f5f0e8",
            buttonSecondaryBg: "#faf6f1",
            buttonSecondaryText: "#44403c",
            buttonSecondaryBorder: "#d4c4b0",
            shadow: "0 2px 12px rgba(28,25,23,0.08)",
        },
    },
    playground: {
        id: "playground",
        name: "Playground",
        icon: "🎈",
        fonts: {
            display: "'Fredoka', sans-serif",
            body: "'Nunito', sans-serif",
            mono: "'JetBrains Mono', monospace",
        },
        colors: {
            background: "#f0f9ff",
            mapBg: "#e0f2fe",
            mapGrid: "#bae6fd",
            aisleLine: "#7dd3fc",
            aisleLabel: "#0284c7",
            stackOutline: "#38bdf8",
            stackFill: "#f0f9ff",
            sectionPillBg: "#f472b6",
            sectionPillText: "#ffffff",
            sectionPillBorder: "#f472b6",
            boothText: "#0c4a6e",
            boothStroke: "#7dd3fc",
            boothStrokeSelected: "#f59e0b",
            boothStrokeStart: "#10b981",
            boothStrokeEnd: "#8b5cf6",
            boothFill: {
                available: "#a7f3d0",
                reserved: "#fde68a",
                occupied: "#fecaca",
            },
            boothFillSelected: "#bfdbfe",
            boothFillStart: "#a7f3d0",
            boothFillEnd: "#ddd6fe",
            routeLine: "#f59e0b",
            routeDot: "#f59e0b",
            startMarker: "#10b981",
            endMarker: "#8b5cf6",
            hallLabel: "#0369a1",
            hallLine: "#7dd3fc",
        },
        ui: {
            pageBg: "#f0f9ff",
            sidebarBg: "#ffffff",
            sidebarBorder: "#bae6fd",
            panelBg: "#ffffff",
            panelBorder: "#bae6fd",
            panelRadius: "1rem",
            textMain: "#0f172a",
            textMuted: "#64748b",
            textInverse: "#ffffff",
            accent: "#f59e0b",
            badgeAvailable: "#a7f3d0",
            badgeAvailableText: "#065f46",
            badgeReserved: "#fde68a",
            badgeReservedText: "#92400e",
            badgeOccupied: "#fecaca",
            badgeOccupiedText: "#991b1b",
            inputBg: "#ffffff",
            inputBorder: "#7dd3fc",
            buttonPrimaryBg: "#f59e0b",
            buttonPrimaryText: "#ffffff",
            buttonSecondaryBg: "#e0f2fe",
            buttonSecondaryText: "#0369a1",
            buttonSecondaryBorder: "#7dd3fc",
            shadow: "0 8px 24px rgba(14,165,233,0.15)",
        },
    },
};

export const DEFAULT_THEME: ThemeKey = "night-market";

export function getTheme(key: ThemeKey): MapTheme {
    return THEMES[key];
}

export function statusLabel(status: BoothStatus): string {
    return status;
}
