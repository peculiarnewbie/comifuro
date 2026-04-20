function buttonClass(tone: "primary" | "subtle" | "danger") {
    switch (tone) {
        case "primary":
            return "border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800";
        case "danger":
            return "border-rose-700 bg-rose-700 text-white hover:bg-rose-600";
        default:
            return "border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50";
    }
}

export default function ActionButton(props: {
    label: string;
    tone?: "primary" | "subtle" | "danger";
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={props.disabled}
            class={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass(
                props.tone ?? "subtle",
            )}`}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}
