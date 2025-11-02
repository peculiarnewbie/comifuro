import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For } from "solid-js";
import { MiddleRow, EdgeRow } from "../components/main-market";

const CELL = 16;

export const Route = createFileRoute("/map")({
    component: RouteComponent,
});

const ColumnGraphic = (props: {
    label: string;
    booth: number[];
    x: number;
    y: number;
}) => {
    const count = props.booth.length;
    const colW = CELL * 4;
    const colH = CELL * (count * 2);

    return (
        <g transform={`translate(${props.x} ${props.y})`}>
            <rect
                x={0}
                y={0}
                width={colW}
                height={colH}
                fill="#fff"
                stroke="#000"
                stroke-width="1"
                rx="2"
            />

            <For each={props.booth}>
                {(r, rowI) => {
                    const rowY = CELL * ((count - rowI() - 1) * 2);
                    const leftNumber = 61 - r;
                    const rightNumber = r;
                    if (rowI() === 0 || rowI() === props.booth.length - 1) {
                        return (
                            <EdgeRow
                                rowY={rowY}
                                leftNumber={leftNumber}
                                rightNumber={rightNumber}
                                cellSize={CELL}
                                top={rowI() !== 0}
                            />
                        );
                    }
                    return (
                        <MiddleRow
                            rowY={rowY}
                            leftNumber={leftNumber}
                            rightNumber={rightNumber}
                            cellSize={CELL}
                        />
                    );
                }}
            </For>
        </g>
    );
};

const StackGraphic = (props: {
    label: string;
    count: number;
    x: number;
    y: number;
    spacing?: number;
}) => {
    const colW = CELL * 4;
    const colH = CELL * (props.count * 2 + 4);
    const gap = props.spacing ?? 10;

    const Label = (t: string, lx: number, ly: number) => (
        <g transform={`translate(${lx} ${ly})`}>
            <rect
                x={-12}
                y={-12}
                width={24}
                height={24}
                rx="3"
                fill="#eee"
                stroke="#000"
            />
            <text
                x={0}
                y={4}
                text-anchor="middle"
                font-size="12"
                font-family="ui-sans-serif, system-ui, Arial"
                fill="#000"
            >
                {t}
            </text>
        </g>
    );

    return (
        <g transform={`translate(${props.x} ${props.y})`}>
            {Label(props.label, colW / 2, -18)}
            <ColumnGraphic
                label={props.label}
                booth={[1, 2, 3, 4, 5, 6, 7, 8]}
                x={0}
                y={0}
            />
            {Label(props.label, colW / 2, colH + 18)}
        </g>
    );
};

function RouteComponent() {
    const [cam, setCam] = createSignal({ x: 0, y: 0, s: 1 });

    const MIN_S = 0.1;
    const MAX_S = 8;

    const pointers = new Map<number, { x: number; y: number }>();
    let lastPan: { x: number; y: number } | null = null;
    let lastDistance = 0;
    let lastCenter: { x: number; y: number } | null = null;

    let svgEl: SVGSVGElement | null = null;

    // momentum state
    let inertiaRAF: number | null = null;
    let inertVx = 0;
    let inertVy = 0;
    let inertActive = false;

    // velocity sampling (ring buffer)
    type Sample = { t: number; dx: number; dy: number };
    const samples: Sample[] = [];
    const MAX_SAMPLES = 5; // last few frames

    function clientToSvg(x: number, y: number) {
        if (!svgEl) return { x, y };
        const pt = svgEl.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const m = (svgEl.getScreenCTM() as DOMMatrix).inverse();
        const p = pt.matrixTransform(m);
        return { x: p.x, y: p.y };
    }

    function zoomAround(focal: { x: number; y: number }, factor: number) {
        setCam((c) => {
            const sNew = Math.max(MIN_S, Math.min(MAX_S, c.s * factor));
            const k = sNew / c.s;
            const xNew = focal.x - k * (focal.x - c.x);
            const yNew = focal.y - k * (focal.y - c.y);
            return { x: xNew, y: yNew, s: sNew };
        });
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        const focal = clientToSvg(e.clientX, e.clientY);
        zoomAround(focal, factor);
    }

    function stopInertia() {
        if (inertiaRAF != null) {
            cancelAnimationFrame(inertiaRAF);
            inertiaRAF = null;
        }
        inertActive = false;
        inertVx = 0;
        inertVy = 0;
    }

    function getInertiaFriction() {
        const w = svgEl?.getBoundingClientRect().width ?? 400;
        const baseline = 400; // px
        const scale = Math.max(0.5, Math.min(3, w / baseline));
        // Original friction ~0.0018; scale it by width/baseline
        return 0.005 * scale;
    }

    function startInertia(vx: number, vy: number) {
        // Ignore tiny velocities
        const threshold = 0.05;
        if (Math.hypot(vx, vy) < threshold) return;

        inertVx = vx;
        inertVy = vy;
        inertActive = true;

        let lastT = performance.now();

        let friction = getInertiaFriction();
        const maxStep = 60; // cap per-frame movement in px (screen space scaled)

        const tick = () => {
            const now = performance.now();
            const dt = Math.max(0, now - lastT);
            lastT = now;

            // exponential decay
            const decay = Math.exp(-friction * dt);
            inertVx *= decay;
            inertVy *= decay;

            // stop condition
            if (Math.hypot(inertVx, inertVy) < 0.02) {
                stopInertia();
                return;
            }

            // apply displacement scaled by dt
            let dx = inertVx * dt;
            let dy = inertVy * dt;

            // cap per-frame step to keep stable on background tabs
            const stepLen = Math.hypot(dx, dy);
            if (stepLen > maxStep) {
                const k = maxStep / stepLen;
                dx *= k;
                dy *= k;
            }

            setCam((c) => ({ ...c, x: c.x + dx / 2, y: c.y + dy / 2 }));

            inertiaRAF = requestAnimationFrame(tick);
        };

        inertiaRAF = requestAnimationFrame(tick);
    }

    function onPointerDown(e: PointerEvent) {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // any new touch cancels inertia
        stopInertia();
        samples.length = 0;

        if (pointers.size === 1) {
            lastPan = { x: e.clientX, y: e.clientY };
        } else if (pointers.size === 2) {
            const arr = [...pointers.values()];
            const dx = arr[0].x - arr[1].x;
            const dy = arr[0].y - arr[1].y;
            lastDistance = Math.hypot(dx, dy);
            const cx = (arr[0].x + arr[1].x) / 2;
            const cy = (arr[0].y + arr[1].y) / 2;
            lastCenter = clientToSvg(cx, cy);
            lastPan = null;
        }
    }

    function onPointerMove(e: PointerEvent) {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId)!;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 1 && lastPan) {
            const dx = e.clientX - lastPan.x;
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            setCam((c) => ({ ...c, x: c.x + dx / 2, y: c.y + dy / 2 }));

            // velocity sample
            const now = performance.now();
            samples.push({ t: now, dx, dy });
            if (samples.length > MAX_SAMPLES) samples.shift();
        } else if (pointers.size === 2) {
            // pinch (no momentum collection)
            const arr = [...pointers.values()];
            const dx = arr[0].x - arr[1].x;
            const dy = arr[0].y - arr[1].y;
            const dist = Math.hypot(dx, dy);
            if (lastDistance > 0 && lastCenter) {
                const factor = dist / lastDistance;
                zoomAround(lastCenter, factor);
            }
            lastDistance = dist;
            const cx = (arr[0].x + arr[1].x) / 2;
            const cy = (arr[0].y + arr[1].y) / 2;
            lastCenter = clientToSvg(cx, cy);

            // clear samples so pinch doesn't produce momentum
            samples.length = 0;
        }
    }

    function computeReleaseVelocity() {
        // Weighted average based on time
        if (samples.length === 0) return { vx: 0, vy: 0 };
        const now = performance.now();
        // consider last ~120ms window
        const windowMs = 120;
        let sumW = 0;
        let vx = 0;
        let vy = 0;
        for (let i = samples.length - 1; i >= 0; i--) {
            const s = samples[i];
            const dt = Math.max(1, now - s.t); // ms
            if (now - s.t > windowMs) break;
            const w = 1 / dt; // recent samples weigh more
            vx += (s.dx / (dt / 16.67)) * w; // normalize to px per 16.67ms (~60fps)
            vy += (s.dy / (dt / 16.67)) * w;
            sumW += w;
        }
        if (sumW === 0) return { vx: 0, vy: 0 };
        vx /= sumW;
        vy /= sumW;

        // clamp initial magnitude to avoid huge flings
        const maxInitial = 3.2; // px per ms normalized
        const mag = Math.hypot(vx, vy);
        if (mag > maxInitial) {
            const k = maxInitial / mag;
            vx *= k;
            vy *= k;
        }
        return { vx, vy };
    }

    function endPointer(e: PointerEvent) {
        pointers.delete(e.pointerId);

        if (pointers.size === 0) {
            // if single-finger pan just ended, start inertia
            if (lastPan) {
                const { vx, vy } = computeReleaseVelocity();
                startInertia(vx, vy);
            }
            lastPan = null;
            lastDistance = 0;
            lastCenter = null;
            samples.length = 0;
        } else if (pointers.size === 1) {
            // switch to pan with remaining pointer
            const [only] = [...pointers.values()];
            lastPan = { x: only.x, y: only.y };
            lastDistance = 0;
            lastCenter = null;
            samples.length = 0;
        }
    }

    // Double-tap zoom still works; cancel inertia if active
    function onPointerUp(e: PointerEvent) {
        endPointer(e);
    }

    function onPointerCancel(e: PointerEvent) {
        endPointer(e);
    }

    const colW = CELL * 4;
    const stackGapX = 40;

    return (
        <div style="width:100vw;height:100vh;background:#f5f7fb;">
            <svg
                ref={(el) => (svgEl = el)}
                width="100%"
                height="100%"
                viewBox="0 0 420 720"
                style="touch-action:none"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
            >
                <rect x="0" y="0" width="100%" height="100%" fill="#f5f7fb" />
                <g
                    transform={`translate(${cam().x} ${cam().y}) scale(${cam().s})`}
                    vector-effect="non-scaling-stroke"
                >
                    {["A", "B", "C", "D", "E"].map((s, i) => (
                        <g>
                            <StackGraphic
                                count={6}
                                label={s}
                                x={i * (colW + stackGapX) + 20}
                                y={40}
                            />
                        </g>
                    ))}
                </g>
                <style>{`text { user-select: none; -webkit-user-select: none; }`}</style>
                <style>{`
          .cell-rect { transition: fill 0.1s ease; cursor: pointer; }
          .cell-rect:hover { fill: #f88; }
        `}</style>
            </svg>
        </div>
    );
}
