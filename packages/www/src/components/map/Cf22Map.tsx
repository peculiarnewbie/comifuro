import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
    boothByCode,
    circleEntries,
    dayLabel,
    entriesForBooth,
    mapBooths,
    mapBounds,
    searchCircles,
    type CircleEntry,
    type MapBooth,
    type MapDay,
} from "../../lib/cf22-map";
import "./cf22-map.css";

type View = { x: number; y: number; width: number; height: number };
type Pointer = { x: number; y: number };

export default function Cf22Map() {
    const [query, setQuery] = createSignal("");
    const [day, setDay] = createSignal<MapDay>("all");
    const [view, setView] = createSignal<View>({ ...mapBounds });
    const [selected, setSelected] = createSignal<string | null>(null);
    const [hovered, setHovered] = createSignal<string | null>(null);
    const [tooltipPosition, setTooltipPosition] = createSignal({ x: 0, y: 0 });
    const [dragging, setDragging] = createSignal(false);
    const [imageError, setImageError] = createSignal(false);
    const results = createMemo(() => searchCircles(query(), day()));
    const selectionEntries = createMemo(() => entriesForBooth(selected() ?? "", day()));
    const highlighted = createMemo(
        () =>
            new Set([
                ...(selected() ? [selected()!] : []),
                ...selectionEntries().flatMap((entry) => entry.codes),
            ]),
    );
    const hoverEntries = createMemo(() => entriesForBooth(hovered() ?? "", day()));
    const pointers = new Map<number, Pointer>();
    let svg!: SVGSVGElement;
    let frame!: HTMLDivElement;
    let tooltip: HTMLDivElement | undefined;
    createEffect(() => {
        if (!hovered()) return;
        queueMicrotask(() => {
            const element = tooltip;
            if (!element || !hovered()) return;
            setTooltipPosition((current) => ({
                x: Math.max(8, Math.min(current.x, frame.clientWidth - element.offsetWidth - 8)),
                y: Math.max(8, Math.min(current.y, frame.clientHeight - element.offsetHeight - 8)),
            }));
        });
    });
    let gesture: { origin: Pointer; code: string | null; moved: boolean } | null = null;

    function mapPoint(point: Pointer) {
        const matrix = svg.getScreenCTM();
        if (!matrix) return { x: 0, y: 0 };
        return new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse());
    }
    function zoom(factor: number, focus?: Pointer) {
        const current = view();
        const width = Math.max(
            mapBounds.width / 16,
            Math.min(mapBounds.width * 1.3, current.width / factor),
        );
        const ratio = width / current.width;
        const center = focus ?? {
            x: current.x + current.width / 2,
            y: current.y + current.height / 2,
        };
        setView({
            x: center.x - (center.x - current.x) * ratio,
            y: center.y - (center.y - current.y) * ratio,
            width,
            height: current.height * ratio,
        });
        setHovered(null);
    }
    function focusBooth(code: string) {
        const booth = boothByCode.get(code);
        if (!booth) return;
        setSelected(code);
        setHovered(null);
        const width = 150;
        const height = (width * mapBounds.height) / mapBounds.width;
        setView({
            x: booth.x + booth.width / 2 - width / 2,
            y: booth.y + booth.height / 2 - height / 2,
            width,
            height,
        });
    }
    function chooseEntry(entry: CircleEntry) {
        const code = entry.codes[0];
        if (code) focusBooth(code);
    }
    function showTooltip(code: string, x: number, y: number) {
        const bounds = frame.getBoundingClientRect();
        setTooltipPosition({
            x: Math.max(8, Math.min(bounds.width - 296, x - bounds.left + 16)),
            y: Math.max(8, Math.min(bounds.height - 170, y - bounds.top + 16)),
        });
        setHovered(code);
    }
    function pointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1) {
            const target =
                event.target instanceof Element ? event.target.closest("[data-booth]") : null;
            gesture = {
                origin: { x: event.clientX, y: event.clientY },
                code: target?.getAttribute("data-booth") ?? null,
                moved: false,
            };
        } else if (gesture) gesture.moved = true;
        svg.setPointerCapture(event.pointerId);
    }
    function pointerMove(event: PointerEvent) {
        const previous = pointers.get(event.pointerId);
        if (!previous || !gesture) return;
        const next = { x: event.clientX, y: event.clientY };
        if (Math.hypot(next.x - gesture.origin.x, next.y - gesture.origin.y) > 5)
            gesture.moved = true;
        const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (gesture.moved) {
            setDragging(true);
            setHovered(null);
            const before = mapPoint(
                other ? { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 } : previous,
            );
            const after = mapPoint(
                other ? { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 } : next,
            );
            setView((current) => ({
                ...current,
                x: current.x + before.x - after.x,
                y: current.y + before.y - after.y,
            }));
            if (other) {
                const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
                const newDistance = Math.hypot(next.x - other.x, next.y - other.y);
                if (oldDistance > 0 && newDistance > 0) zoom(newDistance / oldDistance, before);
            }
        }
        pointers.set(event.pointerId, next);
    }
    function pointerEnd(event: PointerEvent) {
        if (!pointers.has(event.pointerId)) return;
        if (event.type === "pointerup" && pointers.size === 1 && gesture && !gesture.moved) {
            setSelected(gesture.code);
            if (gesture.code && event.pointerType === "mouse")
                showTooltip(gesture.code, event.clientX, event.clientY);
        }
        pointers.delete(event.pointerId);
        if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
        if (!pointers.size) {
            gesture = null;
            setDragging(false);
        }
    }
    function boothKey(event: KeyboardEvent, booth: MapBooth) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelected(booth.code);
            return;
        }
        const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
        }[event.key];
        if (!direction) return;
        event.preventDefault();
        const dx = direction[0] ?? 0;
        const dy = direction[1] ?? 0;
        const target = mapBooths
            .map((candidate) => {
                const x = candidate.x + candidate.width / 2 - booth.x - booth.width / 2;
                const y = candidate.y + candidate.height / 2 - booth.y - booth.height / 2;
                return {
                    candidate,
                    forward: x * dx + y * dy,
                    score: x * x + y * y + 4 * (x * dy - y * dx) ** 2,
                };
            })
            .filter(({ forward }) => forward > 1)
            .sort((a, b) => a.score - b.score)[0]?.candidate;
        if (target) {
            focusBooth(target.code);
            svg.querySelector<SVGRectElement>(`[data-booth="${target.code}"]`)?.focus();
        }
    }
    onMount(() => {
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const delta =
                event.deltaY *
                (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1);
            zoom(Math.exp(-delta * 0.002), mapPoint({ x: event.clientX, y: event.clientY }));
        };
        svg.addEventListener("wheel", wheel, { passive: false });
        onCleanup(() => svg.removeEventListener("wheel", wheel));
    });

    return (
        <main
            class="cf-map"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setHovered(null);
                    setSelected(null);
                }
            }}
        >
            <header class="cf-header">
                <a class="cf-brand" href="/" aria-label="Comifuro home">
                    CF<span>22</span>
                </a>
                <div>
                    <h1>Circle map</h1>
                    <p>Comic Frontier 22 · Halls 6–10</p>
                </div>
                <a class="cf-source" href="/maps/cf22/source.pdf" target="_blank" rel="noreferrer">
                    Original PDF ↗
                </a>
            </header>
            <div class="cf-layout">
                <aside class="cf-sidebar" aria-label="Circle directory">
                    <div class="cf-directory-heading">
                        <span class="cf-eyebrow">FIND YOUR NEXT STOP</span>
                        <h2>
                            Explore the circles<span>.</span>
                        </h2>
                        <p>Search a name or booth, then find it on the floor.</p>
                    </div>
                    <label class="cf-search-label" for="circle-search">
                        Circle name or booth code
                    </label>
                    <div class="cf-search">
                        <span aria-hidden="true">⌕</span>
                        <input
                            id="circle-search"
                            type="search"
                            placeholder="Try Ichigowarano or B-01…"
                            value={query()}
                            onInput={(event) => setQuery(event.currentTarget.value)}
                        />
                    </div>
                    <div class="cf-days" role="group" aria-label="Event day">
                        <For each={["all", "saturday", "sunday"] as const}>
                            {(value) => (
                                <button
                                    aria-pressed={day() === value}
                                    onClick={() => {
                                        setDay(value);
                                        setHovered(null);
                                    }}
                                >
                                    {value === "all" ? "All days" : dayLabel(value)}
                                </button>
                            )}
                        </For>
                    </div>
                    <Show when={selected()}>
                        {(code) => (
                            <section class="cf-selection" aria-live="polite">
                                <div class="cf-selection-top">
                                    <span class="cf-eyebrow">SELECTED BOOTH</span>
                                    <button
                                        aria-label="Clear selection"
                                        onClick={() => setSelected(null)}
                                    >
                                        ×
                                    </button>
                                </div>
                                <h3>{code()}</h3>
                                <For each={selectionEntries()}>
                                    {(entry) => (
                                        <div class="cf-selected-circle">
                                            <strong>{entry.name}</strong>
                                            <span>
                                                {dayLabel(entry.day)} · {entry.codes.join(" / ")}
                                            </span>
                                        </div>
                                    )}
                                </For>
                                <Show when={!selectionEntries().length}>
                                    <p>
                                        {day() === "all"
                                            ? "No circle listed in the PDF."
                                            : "No circle listed for this day."}
                                    </p>
                                </Show>
                            </section>
                        )}
                    </Show>
                    <div class="cf-result-heading">
                        <span>{results().length.toLocaleString()} directory entries</span>
                        <span>BOOTH ↗</span>
                    </div>
                    <div class="cf-results">
                        <For each={results().slice(0, 80)}>
                            {(entry) => (
                                <button class="cf-result" onClick={() => chooseEntry(entry)}>
                                    <strong>{entry.name}</strong>
                                    <span>{entry.codes.join(" / ")}</span>
                                    <small>{dayLabel(entry.day)}</small>
                                </button>
                            )}
                        </For>
                        <Show when={!results().length}>
                            <p class="cf-empty">
                                No circles found. Try a different name or booth code.
                            </p>
                        </Show>
                        <Show when={results().length > 80}>
                            <p class="cf-empty">Showing the first 80. Search to narrow the list.</p>
                        </Show>
                    </div>
                    <footer class="cf-directory-footer">
                        {circleEntries.length.toLocaleString()} listings in the CF22 directory
                        <br />
                        Hover a box to meet its circle.
                    </footer>
                </aside>
                <div
                    class="cf-stage"
                    ref={(element) => {
                        frame = element;
                    }}
                >
                    <div class="cf-map-label">
                        <span class="cf-live-dot" /> THE FLOOR PLAN{" "}
                        <span class="cf-map-label-detail">· CF22</span>
                    </div>
                    <svg
                        ref={(element) => {
                            svg = element;
                        }}
                        class="cf-floor"
                        classList={{ "is-dragging": dragging() }}
                        viewBox={`${view().x} ${view().y} ${view().width} ${view().height}`}
                        aria-label="Interactive Comic Frontier 22 floor map. Drag to pan, scroll or pinch to zoom. Search to locate a circle; use arrow keys between booths."
                        onPointerDown={pointerDown}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerEnd}
                        onPointerCancel={pointerEnd}
                        onLostPointerCapture={pointerEnd}
                    >
                        <image
                            href="/maps/cf22/floor.svg"
                            x="0"
                            y="0"
                            width="1683.78"
                            height="1190.55"
                            pointer-events="none"
                            onError={() => setImageError(true)}
                        />
                        <For each={mapBooths}>
                            {(booth) => (
                                <rect
                                    data-booth={booth.code}
                                    x={booth.x}
                                    y={booth.y}
                                    width={booth.width}
                                    height={booth.height}
                                    class="cf-booth"
                                    classList={{
                                        "is-selected": highlighted().has(booth.code),
                                        "is-hovered": hovered() === booth.code,
                                    }}
                                    role="button"
                                    tabindex={
                                        booth.code === (selected() ?? mapBooths[0]?.code) ? 0 : -1
                                    }
                                    aria-label={`${booth.code}: ${
                                        entriesForBooth(booth.code, day())
                                            .map(
                                                (entry) => `${entry.name} (${dayLabel(entry.day)})`,
                                            )
                                            .join("; ") || "No circle listed"
                                    }`}
                                    onPointerEnter={(event) => {
                                        if (!pointers.size && event.pointerType !== "touch")
                                            showTooltip(booth.code, event.clientX, event.clientY);
                                    }}
                                    onPointerLeave={() => setHovered(null)}
                                    onFocus={(event) => {
                                        const box = event.currentTarget.getBoundingClientRect();
                                        showTooltip(booth.code, box.right, box.top);
                                    }}
                                    onBlur={() => setHovered(null)}
                                    onKeyDown={(event) => boothKey(event, booth)}
                                />
                            )}
                        </For>
                    </svg>
                    <Show when={imageError()}>
                        <div class="cf-map-error" role="alert">
                            The floor plan could not load. Reload the page or{" "}
                            <a href="/maps/cf22/source.pdf">open the PDF</a>.
                        </div>
                    </Show>
                    <Show when={hovered()}>
                        {(code) => (
                            <div
                                class="cf-tooltip"
                                role="tooltip"
                                ref={(element) => {
                                    tooltip = element;
                                }}
                                style={{
                                    left: `${tooltipPosition().x}px`,
                                    top: `${tooltipPosition().y}px`,
                                }}
                            >
                                <span class="cf-eyebrow">BOOTH {code()}</span>
                                <For each={hoverEntries()}>
                                    {(entry) => (
                                        <div>
                                            <strong>{entry.name}</strong>
                                            <small>{dayLabel(entry.day)}</small>
                                        </div>
                                    )}
                                </For>
                                <Show when={!hoverEntries().length}>
                                    <strong>
                                        {day() === "all"
                                            ? "No circle listed in the PDF"
                                            : "No circle listed for this day"}
                                    </strong>
                                </Show>
                            </div>
                        )}
                    </Show>
                    <div class="cf-map-help">
                        Drag to explore <span>·</span> Scroll or pinch to zoom <span>·</span> Tap a
                        booth for details
                    </div>
                    <div class="cf-controls">
                        <button aria-label="Zoom in" onClick={() => zoom(1.5)}>
                            +
                        </button>
                        <span>{Math.round((mapBounds.width / view().width) * 100)}%</span>
                        <button aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
                            −
                        </button>
                        <button
                            class="cf-fit"
                            onClick={() => {
                                setView({ ...mapBounds });
                                setHovered(null);
                            }}
                        >
                            Fit map
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
