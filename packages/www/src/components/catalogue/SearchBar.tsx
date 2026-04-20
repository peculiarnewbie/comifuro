import { For, Show } from "solid-js";

export default function SearchBar(props: {
    value: string;
    onChange: (value: string) => void;
    suggestions: string[];
    onSelectSuggestion: (tag: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    variant?: "light" | "dark";
}) {
    const isDark = () => props.variant === "dark";

    return (
        <div class="relative w-full">
            <input
                type="text"
                placeholder={props.placeholder ?? "Search tweets"}
                value={props.value}
                onInput={(event) => props.onChange(event.currentTarget.value)}
                onFocus={() => props.onFocus?.()}
                onBlur={() => props.onBlur?.()}
                class={`w-full ${
                    isDark()
                        ? "rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-50 outline-none transition focus:border-amber-400"
                        : "rounded border p-2"
                }`}
            />
            <Show when={props.suggestions.length > 0}>
                <div
                    class={`absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded border shadow-lg ${
                        isDark()
                            ? "rounded-2xl border-stone-700 bg-stone-900 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)]"
                            : "border-stone-200 bg-white"
                    }`}
                >
                    <For each={props.suggestions}>
                        {(tag) => (
                            <button
                                type="button"
                                class={`block w-full px-3 py-2 text-left text-sm ${
                                    isDark()
                                        ? "text-stone-100 hover:bg-stone-800"
                                        : "text-stone-800 hover:bg-stone-100"
                                }`}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    props.onSelectSuggestion(tag);
                                }}
                            >
                                {tag}
                            </button>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}
