import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { MapTheme } from "../../lib/map-themes";
import {
    GROUPS,
    floorPlan,
    pointsToPath,
    buildRoutePoints,
    type Booth,
} from "../../lib/map-data";

type Camera = { x: number; y: number; s: number };

export default function MapCanvas(props: {
    theme: MapTheme;
    selectedBoothId: string | null;
    startBoothId: string | null;
    endBoothId: string | null;
    focusRequest: { boothId: string; scale?: number } | null;
    onSelectBooth: (id: string) => void;
    onClearSelection: () => void;
    onFocusConsumed: () => void;
}) {
    const [cam, setCam] = createSignal<Camera>({ x: 0, y: 0, s: 1 });
    const [isDragging, setIsDragging] = createSignal(false);
    const [routeDashOffset, setRouteDashOffset] = createSignal(0);

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

    const floorCenter = {
        x: (floorPlan.bounds.minX + floorPlan.bounds.maxX) / 2,
        y: (floorPlan.bounds.minY + floorPlan.bounds.maxY) / 2,
    };

    const MIN_S = 0.5;
    const MAX_S = 3;

    const pointers = new Map<number, { x: number; y: number }>();
    let lastPan: { x: number; y: number } | null = null;
    let lastDistance = 0;
    let lastCenter: { x: number; y: number } | null = null;
    let panDistance = 0;
    let svgEl: SVGSVGElement | null = null;

    let inertiaRAF: number | null = null;
    let inertVx = 0;
    let inertVy = 0;

    type Sample = { t: number; dx: number; dy: number };
    const samples: Sample[] = [];
    const MAX_SAMPLES = 5;

    onCleanup(() => {
        stopInertia();
    });

    // Route animation
    let routeAnimFrame: number | null = null;
    onMount(() => {
        const animate = () => {
            setRouteDashOffset((prev) => prev - 0.5);
            routeAnimFrame = requestAnimationFrame(animate);
        };
        routeAnimFrame = requestAnimationFrame(animate);
        onCleanup(() => {
            if (routeAnimFrame) cancelAnimationFrame(routeAnimFrame);
        });
    });

    // Focus request handler
    createEffect(() => {
        const req = props.focusRequest;
        if (!req) return;
        const booth = floorPlan.boothById.get(req.boothId);
        if (!booth) {
            props.onFocusConsumed();
            return;
        }
        const scale = Math.max(MIN_S, Math.min(MAX_S, req.scale ?? 2.2));
        const targetCenter = getViewportCenter();
        stopInertia();
        props.onSelectBooth(booth.id);
        setCam({
            x: targetCenter.x - booth.centerX * scale,
            y: targetCenter.y - booth.centerY * scale,
            s: scale,
        });
        props.onFocusConsumed();
    });

    function clientToSvg(x: number, y: number) {
        if (!svgEl) return { x, y };
        const pt = svgEl.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const matrix = (svgEl.getScreenCTM() as DOMMatrix | null)?.inverse();
        if (!matrix) return { x, y };
        const point = pt.matrixTransform(matrix);
        return { x: point.x, y: point.y };
    }

    function zoomAround(focal: { x: number; y: number }, factor: number) {
        setCam((current) => {
            const nextScale = Math.max(
                MIN_S,
                Math.min(MAX_S, current.s * factor),
            );
            const ratio = nextScale / current.s;
            return {
                x: focal.x - ratio * (focal.x - current.x),
                y: focal.y - ratio * (focal.y - current.y),
                s: nextScale,
            };
        });
    }

    function getViewportCenter() {
        if (!svgEl) return floorCenter;
        const rect = svgEl.getBoundingClientRect();
        return clientToSvg(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function resetView() {
        setCam({ x: 0, y: 0, s: 1 });
    }

    function normalizeWheelDelta(event: WheelEvent) {
        const rect = svgEl?.getBoundingClientRect();
        const lineSize = 16;
        const pageSize = rect?.height ?? 800;
        const factor =
            event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? lineSize
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                  ? pageSize
                  : 1;
        return { x: event.deltaX * factor, y: event.deltaY * factor };
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        stopInertia();
        const { x: deltaX, y: deltaY } = normalizeWheelDelta(event);
        const focal = clientToSvg(event.clientX, event.clientY);
        if (event.ctrlKey || event.metaKey) {
            const factor = Math.exp(-deltaY * 0.0015);
            zoomAround(focal, factor);
            return;
        }
        const nextPoint = clientToSvg(
            event.clientX + deltaX,
            event.clientY + deltaY,
        );
        const dx = nextPoint.x - focal.x;
        const dy = nextPoint.y - focal.y;
        setCam((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
    }

    function stopInertia() {
        if (inertiaRAF != null) {
            cancelAnimationFrame(inertiaRAF);
            inertiaRAF = null;
        }
        inertVx = 0;
        inertVy = 0;
    }

    function getInertiaFriction() {
        const width = svgEl?.getBoundingClientRect().width ?? 400;
        const baseline = 400;
        const scale = Math.max(0.5, Math.min(3, width / baseline));
        return 0.01 * scale;
    }

    function startInertia(vx: number, vy: number) {
        if (Math.hypot(vx, vy) < 0.05) return;
        inertVx = vx;
        inertVy = vy;
        let lastT = performance.now();
        const friction = getInertiaFriction();
        const maxStep = 60;
        const tick = () => {
            const now = performance.now();
            const dt = Math.max(0, now - lastT);
            lastT = now;
            const decay = Math.exp(-friction * dt);
            inertVx *= decay;
            inertVy *= decay;
            if (Math.hypot(inertVx, inertVy) < 0.02) {
                stopInertia();
                return;
            }
            let dx = inertVx * dt;
            let dy = inertVy * dt;
            const stepLength = Math.hypot(dx, dy);
            if (stepLength > maxStep) {
                const ratio = maxStep / stepLength;
                dx *= ratio;
                dy *= ratio;
            }
            setCam((current) => ({
                ...current,
                x: current.x + dx,
                y: current.y + dy,
            }));
            inertiaRAF = requestAnimationFrame(tick);
        };
        inertiaRAF = requestAnimationFrame(tick);
    }

    function onPointerDown(event: PointerEvent) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        stopInertia();
        samples.length = 0;
        panDistance = 0;
        setIsDragging(false);
        if (pointers.size === 1) {
            lastPan = { x: event.clientX, y: event.clientY };
            return;
        }
        if (pointers.size === 2) {
            const entries = [...pointers.values()];
            const dx = entries[0]!.x - entries[1]!.x;
            const dy = entries[0]!.y - entries[1]!.y;
            lastDistance = Math.hypot(dx, dy);
            lastCenter = clientToSvg(
                (entries[0]!.x + entries[1]!.x) / 2,
                (entries[0]!.y + entries[1]!.y) / 2,
            );
            lastPan = null;
        }
    }

    function onPointerMove(event: PointerEvent) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1 && lastPan) {
            const previousPoint = clientToSvg(lastPan.x, lastPan.y);
            const nextPoint = clientToSvg(event.clientX, event.clientY);
            const dx = nextPoint.x - previousPoint.x;
            const dy = nextPoint.y - previousPoint.y;
            panDistance += Math.hypot(
                event.clientX - lastPan.x,
                event.clientY - lastPan.y,
            );
            if (panDistance > 2) setIsDragging(true);
            lastPan = { x: event.clientX, y: event.clientY };
            setCam((current) => ({
                ...current,
                x: current.x + dx,
                y: current.y + dy,
            }));
            const now = performance.now();
            samples.push({ t: now, dx, dy });
            if (samples.length > MAX_SAMPLES) samples.shift();
            return;
        }
        if (pointers.size === 2 && lastCenter) {
            const entries = [...pointers.values()];
            const dx = entries[0]!.x - entries[1]!.x;
            const dy = entries[0]!.y - entries[1]!.y;
            const distance = Math.hypot(dx, dy);
            if (lastDistance > 0) {
                zoomAround(lastCenter, distance / lastDistance);
            }
            lastDistance = distance;
            lastCenter = clientToSvg(
                (entries[0]!.x + entries[1]!.x) / 2,
                (entries[0]!.y + entries[1]!.y) / 2,
            );
            samples.length = 0;
        }
    }

    function computeReleaseVelocity() {
        if (samples.length === 0) return { vx: 0, vy: 0 };
        const now = performance.now();
        const windowMs = 120;
        let sumW = 0;
        let vx = 0;
        let vy = 0;
        for (let index = samples.length - 1; index >= 0; index -= 1) {
            const sample = samples[index]!;
            const dt = Math.max(1, now - sample.t);
            if (now - sample.t > windowMs) break;
            const weight = 1 / dt;
            vx += (sample.dx / (dt / 16.67)) * weight;
            vy += (sample.dy / (dt / 16.67)) * weight;
            sumW += weight;
        }
        if (sumW === 0) return { vx: 0, vy: 0 };
        vx /= sumW;
        vy /= sumW;
        const maxInitial = 3.2;
        const magnitude = Math.hypot(vx, vy);
        if (magnitude > maxInitial) {
            const ratio = maxInitial / magnitude;
            vx *= ratio;
            vy *= ratio;
        }
        return { vx, vy };
    }

    function endPointer(event: PointerEvent) {
        pointers.delete(event.pointerId);
        if (pointers.size === 0) {
            if (lastPan && panDistance > 2) {
                const { vx, vy } = computeReleaseVelocity();
                startInertia(vx, vy);
            }
            lastPan = null;
            lastDistance = 0;
            lastCenter = null;
            panDistance = 0;
            samples.length = 0;
            setIsDragging(false);
            return;
        }
        if (pointers.size === 1) {
            const [remaining] = [...pointers.values()];
            lastPan = { x: remaining!.x, y: remaining!.y };
            lastDistance = 0;
            lastCenter = null;
            panDistance = 0;
            samples.length = 0;
            setIsDragging(false);
        }
    }

    function zoomIn() {
        zoomAround(getViewportCenter(), 1.2);
    }

    function zoomOut() {
        zoomAround(getViewportCenter(), 1 / 1.2);
    }

    const viewBox = `${floorPlan.bounds.minX} ${floorPlan.bounds.minY} ${floorPlan.bounds.maxX - floorPlan.bounds.minX} ${floorPlan.bounds.maxY - floorPlan.bounds.minY}`;

    const t = props.theme;

    function boothFill(booth: Booth) {
        if (booth.id === props.startBoothId) return t.colors.boothFillStart;
        if (booth.id === props.endBoothId) return t.colors.boothFillEnd;
        if (booth.id === props.selectedBoothId) return t.colors.boothFillSelected;
        return t.colors.boothFill[booth.status];
    }

    function boothStroke(booth: Booth) {
        if (booth.id === props.startBoothId) return t.colors.boothStrokeStart;
        if (booth.id === props.endBoothId) return t.colors.boothStrokeEnd;
        if (booth.id === props.selectedBoothId) return t.colors.boothStrokeSelected;
        return t.colors.boothStroke;
    }

    function boothStrokeWidth(booth: Booth) {
        if (
            booth.id === props.selectedBoothId ||
            booth.id === props.startBoothId ||
            booth.id === props.endBoothId
        )
            return 1.5;
        return 0.75;
    }

    const routePath = createMemo(() => pointsToPath(routePoints()));

    return (
        <section
            class="relative min-w-0 flex-1 overflow-hidden"
            style={{ background: t.colors.background }}
        >
            <svg
                ref={(element) => {
                    svgEl = element;
                }}
                width="100%"
                height="100%"
                viewBox={viewBox}
                preserveAspectRatio="xMinYMin slice"
                class="h-full w-full touch-none"
                style={{ cursor: isDragging() ? "grabbing" : "grab" }}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
            >
                <defs>
                    <pattern
                        id="gridPattern"
                        width="32"
                        height="32"
                        patternUnits="userSpaceOnUse"
                    >
                        <path
                            d="M 32 0 L 0 0 0 32"
                            fill="none"
                            stroke={t.colors.mapGrid}
                            stroke-width="0.5"
                            opacity="0.3"
                        />
                    </pattern>
                </defs>

                <rect
                    x={floorPlan.bounds.minX}
                    y={floorPlan.bounds.minY}
                    width={floorPlan.bounds.maxX - floorPlan.bounds.minX}
                    height={floorPlan.bounds.maxY - floorPlan.bounds.minY}
                    fill={t.colors.mapBg}
                    onClick={() => props.onClearSelection()}
                />
                <rect
                    x={floorPlan.bounds.minX}
                    y={floorPlan.bounds.minY}
                    width={floorPlan.bounds.maxX - floorPlan.bounds.minX}
                    height={floorPlan.bounds.maxY - floorPlan.bounds.minY}
                    fill="url(#gridPattern)"
                    opacity="0.4"
                    style={{ "pointer-events": "none" }}
                />

                <g transform={`translate(${cam().x} ${cam().y})`}>
                    <g
                        transform={`scale(${cam().s})`}
                        vector-effect="non-scaling-stroke"
                    >
                        {/* Main aisles */}
                        <For each={floorPlan.mainAisleXs}>
                            {(x, index) => (
                                <g>
                                    <line
                                        x1={x}
                                        y1={floorPlan.bounds.minY + 20}
                                        x2={x}
                                        y2={floorPlan.bounds.maxY - 20}
                                        stroke={t.colors.aisleLine}
                                        stroke-width="2"
                                        stroke-dasharray="10 10"
                                    />
                                    <text
                                        x={x}
                                        y={floorPlan.bounds.minY + 10}
                                        fill={t.colors.aisleLabel}
                                        font-size="10"
                                        text-anchor="middle"
                                        style={{
                                            "font-family": t.fonts.body,
                                            "pointer-events": "none",
                                        }}
                                    >
                                        Aisle {index() + 1}
                                    </text>
                                </g>
                            )}
                        </For>

                        {/* Hall corridors */}
                        <For each={GROUPS}>
                            {(group) => {
                                const rowStacks = floorPlan.stacks.filter(
                                    (stack) => stack.groupLabel === group.label,
                                );
                                const topCorridorY =
                                    rowStacks[0]?.topCorridorY ?? 0;
                                const bottomCorridorY =
                                    rowStacks[0]?.bottomCorridorY ?? 0;
                                const centerY =
                                    ((rowStacks[0]?.y ?? 0) +
                                        (rowStacks[0]?.y ?? 0) +
                                        (rowStacks[0]?.height ?? 0)) /
                                    2;
                                return (
                                    <g>
                                        <line
                                            x1={floorPlan.bounds.minX + 24}
                                            y1={topCorridorY}
                                            x2={floorPlan.bounds.maxX - 24}
                                            y2={topCorridorY}
                                            stroke={t.colors.hallLine}
                                            stroke-width="1"
                                            stroke-dasharray="6 10"
                                        />
                                        <line
                                            x1={floorPlan.bounds.minX + 24}
                                            y1={bottomCorridorY}
                                            x2={floorPlan.bounds.maxX - 24}
                                            y2={bottomCorridorY}
                                            stroke={t.colors.hallLine}
                                            stroke-width="1"
                                            stroke-dasharray="6 10"
                                        />
                                        <text
                                            x={floorPlan.bounds.minX + 10}
                                            y={centerY}
                                            fill={t.colors.hallLabel}
                                            font-size="12"
                                            style={{
                                                "font-family": t.fonts.body,
                                                "font-weight": 600,
                                            }}
                                        >
                                            {group.label}
                                        </text>
                                    </g>
                                );
                            }}
                        </For>

                        {/* Route line */}
                        <Show when={routePoints().length > 0}>
                            <path
                                d={routePath()}
                                fill="none"
                                stroke={t.colors.routeLine}
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-dasharray="10 6"
                                style={{
                                    "stroke-dashoffset": routeDashOffset(),
                                    transition: "stroke-dashoffset 0.05s linear",
                                }}
                                opacity="0.9"
                            />
                        </Show>

                        {/* Stacks & booths */}
                        <For each={floorPlan.stacks}>
                            {(stack) => (
                                <g>
                                    {/* Top section pill */}
                                    <g
                                        transform={`translate(${stack.x + stack.width / 2} ${stack.y - 34})`}
                                    >
                                        <rect
                                            x={-18}
                                            y={-12}
                                            width={36}
                                            height={24}
                                            rx={
                                                t.id === "playground"
                                                    ? 12
                                                    : t.id === "art-deco"
                                                      ? 0
                                                      : 4
                                            }
                                            fill={t.colors.sectionPillBg}
                                            stroke={t.colors.sectionPillBorder}
                                            stroke-width="1"
                                        />
                                        <text
                                            x="0"
                                            y="4"
                                            fill={t.colors.sectionPillText}
                                            font-size="12"
                                            text-anchor="middle"
                                            style={{
                                                "font-family": t.fonts.display,
                                                "font-weight": 700,
                                                "pointer-events": "none",
                                            }}
                                        >
                                            {stack.section}
                                        </text>
                                    </g>

                                    {/* Stack outline */}
                                    <rect
                                        x={stack.x}
                                        y={stack.y}
                                        width={stack.width}
                                        height={stack.height}
                                        fill={t.colors.stackFill}
                                        stroke={t.colors.stackOutline}
                                        stroke-width="1"
                                        rx={
                                            t.id === "playground"
                                                ? 4
                                                : t.id === "art-deco"
                                                  ? 0
                                                  : 3
                                        }
                                    />

                                    {/* Booths */}
                                    <For each={stack.booths}>
                                        {(booth) => (
                                            <g>
                                                <rect
                                                    x={booth.x}
                                                    y={booth.y}
                                                    width={booth.width}
                                                    height={booth.height}
                                                    rx={
                                                        t.id === "playground"
                                                            ? 2
                                                            : 1
                                                    }
                                                    fill={boothFill(booth)}
                                                    stroke={boothStroke(booth)}
                                                    stroke-width={boothStrokeWidth(
                                                        booth,
                                                    )}
                                                    class="cursor-pointer"
                                                    tabindex={0}
                                                    role="button"
                                                    aria-label={`Select booth ${booth.code}`}
                                                    onPointerDown={(event) => {
                                                        event.stopPropagation();
                                                    }}
                                                    onPointerUp={(event) => {
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        props.onSelectBooth(
                                                            booth.id,
                                                        );
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                                "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            props.onSelectBooth(
                                                                booth.id,
                                                            );
                                                        }
                                                    }}
                                                />
                                                <text
                                                    x={booth.centerX}
                                                    y={booth.centerY + 2}
                                                    fill={t.colors.boothText}
                                                    font-size="6"
                                                    text-anchor="middle"
                                                    style={{
                                                        "font-family":
                                                            t.fonts.mono,
                                                        "pointer-events":
                                                            "none",
                                                        "user-select": "none",
                                                        ...getBoothTextTransform(
                                                            booth,
                                                        ),
                                                    }}
                                                >
                                                    {booth.label}
                                                </text>
                                            </g>
                                        )}
                                    </For>

                                    {/* Bottom section pill */}
                                    <g
                                        transform={`translate(${stack.x + stack.width / 2} ${stack.y + stack.height + 34})`}
                                    >
                                        <rect
                                            x={-18}
                                            y={-12}
                                            width={36}
                                            height={24}
                                            rx={
                                                t.id === "playground"
                                                    ? 12
                                                    : t.id === "art-deco"
                                                      ? 0
                                                      : 4
                                            }
                                            fill={t.colors.sectionPillBg}
                                            stroke={t.colors.sectionPillBorder}
                                            stroke-width="1"
                                        />
                                        <text
                                            x="0"
                                            y="4"
                                            fill={t.colors.sectionPillText}
                                            font-size="12"
                                            text-anchor="middle"
                                            style={{
                                                "font-family": t.fonts.display,
                                                "font-weight": 700,
                                                "pointer-events": "none",
                                            }}
                                        >
                                            {stack.section}
                                        </text>
                                    </g>
                                </g>
                            )}
                        </For>

                        {/* Start marker */}
                        <Show when={startBooth()}>
                            {(booth) => (
                                <g>
                                    <circle
                                        cx={booth().centerX}
                                        cy={booth().centerY}
                                        r="4"
                                        fill={t.colors.startMarker}
                                        stroke={t.colors.background}
                                        stroke-width="2"
                                    />
                                </g>
                            )}
                        </Show>

                        {/* End marker */}
                        <Show when={endBooth()}>
                            {(booth) => (
                                <g>
                                    <circle
                                        cx={booth().centerX}
                                        cy={booth().centerY}
                                        r="4"
                                        fill={t.colors.endMarker}
                                        stroke={t.colors.background}
                                        stroke-width="2"
                                    />
                                </g>
                            )}
                        </Show>
                    </g>
                </g>
            </svg>

            {/* Floating zoom controls */}
            <div
                class="absolute bottom-4 right-4 flex flex-col gap-1"
                style={{ "z-index": 10 }}
            >
                <button
                    class="flex h-9 w-9 items-center justify-center text-lg transition hover:opacity-80"
                    style={{
                        background: t.ui.panelBg,
                        border: `1px solid ${t.ui.panelBorder}`,
                        "border-radius": t.ui.panelRadius,
                        color: t.ui.textMain,
                        "box-shadow": t.ui.shadow,
                    }}
                    onClick={zoomIn}
                    aria-label="Zoom in"
                    title="Zoom in"
                >
                    +
                </button>
                <button
                    class="flex h-9 w-9 items-center justify-center text-lg transition hover:opacity-80"
                    style={{
                        background: t.ui.panelBg,
                        border: `1px solid ${t.ui.panelBorder}`,
                        "border-radius": t.ui.panelRadius,
                        color: t.ui.textMain,
                        "box-shadow": t.ui.shadow,
                    }}
                    onClick={zoomOut}
                    aria-label="Zoom out"
                    title="Zoom out"
                >
                    −
                </button>
                <button
                    class="flex h-9 w-9 items-center justify-center text-sm transition hover:opacity-80"
                    style={{
                        background: t.ui.panelBg,
                        border: `1px solid ${t.ui.panelBorder}`,
                        "border-radius": t.ui.panelRadius,
                        color: t.ui.textMain,
                        "box-shadow": t.ui.shadow,
                    }}
                    onClick={resetView}
                    aria-label="Reset view"
                    title="Reset view"
                >
                    ⌖
                </button>
            </div>
        </section>
    );
}

function getBoothTextTransform(booth: Booth): Record<string, string> {
    if (booth.orientation === "vertical") {
        return {
            transform: `rotate(-90deg)`,
            "transform-origin": `${booth.centerX}px ${booth.centerY}px`,
        };
    }
    return {};
}
