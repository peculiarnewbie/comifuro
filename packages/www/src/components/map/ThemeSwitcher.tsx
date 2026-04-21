import type { ThemeKey, MapTheme } from "../../lib/map-themes";

export default function ThemeSwitcher(props: {
    theme: MapTheme;
    current: ThemeKey;
    onChange: (key: ThemeKey) => void;
}) {
    const themes: ThemeKey[] = ["night-market", "art-deco", "playground"];

    return (
        <div
            class="absolute right-4 top-4 z-20 flex items-center gap-1 p-1"
            style={{
                background: props.theme.ui.panelBg,
                border: `1px solid ${props.theme.ui.panelBorder}`,
                "border-radius": props.theme.ui.panelRadius,
                "box-shadow": props.theme.ui.shadow,
            }}
        >
            {themes.map((key) => {
                const isActive = key === props.current;
                return (
                    <button
                        class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium transition"
                        style={{
                            background: isActive
                                ? props.theme.ui.accent
                                : "transparent",
                            color: isActive
                                ? props.theme.ui.textInverse
                                : props.theme.ui.textMuted,
                            "border-radius":
                                props.theme.id === "art-deco" ? "0" : "6px",
                        }}
                        onClick={() => props.onChange(key)}
                        title={`Switch to ${key} theme`}
                    >
                        <span>
                            {key === "night-market"
                                ? "🌙"
                                : key === "art-deco"
                                  ? "✦"
                                  : "🎈"}
                        </span>
                        <span class="hidden sm:inline">
                            {key === "night-market"
                                ? "Night"
                                : key === "art-deco"
                                  ? "Deco"
                                  : "Play"}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
