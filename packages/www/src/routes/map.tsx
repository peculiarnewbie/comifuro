import { createFileRoute } from '@tanstack/solid-router'
import { createSignal } from "solid-js";

export const Route = createFileRoute('/map')({
  component: RouteComponent,
})

type Seat = {
  row: number;
  a: number | string;
  b: number | string;
};

type ColumnSpec = {
  name: "P" | "Q" | "R";
  rows: Seat[];
};

type Stack = {
  topLabel: "P" | "Q" | "R";
  midLabel: "P" | "Q" | "R";
  botLabel: "P" | "Q" | "R";
  column: ColumnSpec; // repeated three times visually
};

const columnRowsTop: Seat[] = [
  { row: 31, a: "a", b: "b" },
  { row: 32, a: "a", b: "b" },
  { row: 33, a: "a", b: "b" },
  { row: 34, a: "a", b: "b" },
  { row: 35, a: "a", b: "b" },
  { row: 36, a: "a", b: "b" },
  { row: 37, a: "a", b: "b" },
  { row: 24, a: "a", b: "b" },
];

const columnRowsBottom: Seat[] = [
  { row: 38, a: "a", b: "b" },
  { row: 39, a: "a", b: "b" },
  { row: 40, a: "a", b: "b" },
  { row: 41, a: "a", b: "b" },
  { row: 42, a: "a", b: "b" },
  { row: 43, a: "a", b: "b" },
  { row: 44, a: "a", b: "b" },
  { row: 16, a: "a", b: "b" },
];

const stacks: Stack[] = [
  {
    topLabel: "R",
    midLabel: "R",
    botLabel: "R",
    column: { name: "R", rows: columnRowsTop },
  },
  {
    topLabel: "Q",
    midLabel: "Q",
    botLabel: "Q",
    column: { name: "Q", rows: columnRowsTop },
  },
  {
    topLabel: "P",
    midLabel: "P",
    botLabel: "P",
    column: { name: "P", rows: columnRowsTop },
  },
];

const bottomStacks: Stack[] = [
  {
    topLabel: "R",
    midLabel: "R",
    botLabel: "R",
    column: { name: "R", rows: columnRowsBottom },
  },
  {
    topLabel: "Q",
    midLabel: "Q",
    botLabel: "Q",
    column: { name: "Q", rows: columnRowsBottom },
  },
  {
    topLabel: "P",
    midLabel: "P",
    botLabel: "P",
    column: { name: "P", rows: columnRowsBottom },
  },
];

const CELL = 16;

const ColumnGraphic = (props: {
  label: string;
  count: number;
  x: number;
  y: number;
}) => {
  const colW = CELL * 4;
  const colH = CELL * (props.count * 2 + 4);

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
      {/*vertical lines of the area*/}
      <line
      x1={CELL*2}
      y1={0}
      x2={CELL*2}
      y2={colH}
      stroke="black"
      />
      <line
      x1={CELL}
      y1={CELL*2}
      x2={CELL}
      y2={colH - CELL*2}
      stroke="black"
      />
      <line
      x1={CELL*3}
      y1={CELL*2}
      x2={CELL*3}
      y2={colH - CELL*2}
      stroke="black"
      />
      <g>
        {["b", "a", "b", "a"].map((l, i) => (
          <text
            x={CELL * (i + 0.3)}
            y={CELL * 0.9}
            font-size="10"
            fill="#000"
            font-family="ui-sans-serif, system-ui, Arial"
          >
            {l}
          </text>

        ))}
      </g>

      <line
      x1={0}
      y1={CELL*2}
      x2={CELL*4}
      y2={CELL*2}
      stroke="black"
      />
      {(new Array(props.count).fill(1)).map((r, i) => {
        const y = CELL * (i*2 + 2);
        return (
          <g>
            {/* a-b separators*/}

            {/* row separators*/}
            <line
            x1={CELL}
            y1={y + CELL * 2 }
            x2={CELL * 3}
            y2={y + CELL * 2 }
            stroke="black"
            />
            <text
              x={CELL * 2 - 2}
              y={y + CELL * 0.75}
              text-anchor="end"
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
            >
              {i + 1}
            </text>
            <text
              x={CELL * 3 - 2}
              y={y + CELL * 0.75}
              text-anchor="end"
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
            >
              {12 - i}
            </text>
            <rect
              x={0}
              y={y}
              width={CELL}
              height={CELL}
              fill="#eaf3ff"
              stroke="#000"
              stroke-width="0.5"
              class='cell-rect'
            />
            <text
              x={CELL * 0.35}
              y={y + CELL * 0.75}
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
              class='hover-text'
              style={{"pointer-events": "none"}}
            >
              a
            </text>
            <rect
              x={0}
              y={y + CELL}
              width={CELL}
              height={CELL}
              fill="#fff"
              stroke="#000"
              stroke-width="0.5"
              class='cell-rect'
            />
            <text
              x={CELL * 0.35}
              y={y + CELL * 1.75}
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
              style={{"pointer-events": "none"}}
            >
              b
            </text>
            <rect
            onMouseDown={() => console.log(12-i, "b")}
              x={CELL*3}
              y={y}
              width={CELL}
              height={CELL}
              fill="#fff"
              stroke="#000"
              stroke-width="0.5"
              class='cell-rect'
            />
            <text
              x={CELL * 3.35}
              y={y + CELL * 0.75}
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
              style={{"pointer-events": "none"}}
            >
              b
            </text>
            <rect
              onMouseDown={() => console.log(12-i, "a")}
              x={CELL*3}
              y={y + CELL}
              width={CELL}
              height={CELL}
              fill="#eaf3ff"
              stroke="#000"
              stroke-width="0.5"
              class='cell-rect'
            />
            <text
              x={CELL * 3.35}
              y={y + CELL * 1.75}
              font-size="10"
              fill="#000"
              font-family="ui-sans-serif, system-ui, Arial"
              style={{"pointer-events": "none"}}
            >
              a
            </text>
          </g>
        );
      })}
      <g>
        {["a", "b", "a", "b"].map((l, i) => (
          <text
            x={CELL * (i + 0.3)}
            y={colH - 5}
            font-size="10"
            fill="#000"
            font-family="ui-sans-serif, system-ui, Arial"
          >
            {l}
          </text>

        ))}
      </g>
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
      <ColumnGraphic label={props.label} count={props.count} x={0} y={0} />
      {Label(props.label, colW / 2, colH + 18 )}
    </g>
  );
};

function RouteComponent() {
  const [cam, setCam] = createSignal({ x: 0, y: 0, s: 1 });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setCam((c) => {
      const s = Math.max(0.1, Math.min(8, c.s * factor));
      return { ...c, s };
    });
  }

  let dragging = false;
  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    setCam((c) => ({ ...c, x: c.x + e.movementX/2, y: c.y + e.movementY/2 }));
  }
  function onPointerUp() {
    dragging = false;
  }

  const colW = CELL * 4;
  const stackGapX = 40;

  return (
    <div
      style="width:100vw;height:100vh;background:#f5f7fb;touch-action:none;"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 420 720"
        style="touch-action:none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect x="0" y="0" width="100%" height="100%" fill="#f5f7fb" />
        <g
          transform={`translate(${cam().x} ${cam().y}) scale(${cam().s})`}
          vector-effect="non-scaling-stroke"
        >
          {stacks.map((s, i) => (
            <g>
              <StackGraphic
              count={6}
              label='P'
                x={i * (colW + stackGapX) + 20}
                y={40}
              />
            </g>
          ))}

          {/*{bottomStacks.map((s, i) => (
            <g>
              <StackGraphic
              label='P'
                x={i * (colW + stackGapX) + 20}
                y={colH + 40 + stackGapY}
              />
              <g transform={`translate(${i * (colW + stackGapX) + 20} ${
                colH + 40 + stackGapY + colH + 22
              })`}>
                <rect
                  x={colW / 2 - 12}
                  y={0}
                  width={24}
                  height={24}
                  rx="3"
                  fill="#eee"
                  stroke="#000"
                />
                <text
                  x={colW / 2}
                  y={16}
                  text-anchor="middle"
                  font-size="12"
                  font-family="ui-sans-serif, system-ui, Arial"
                  fill="#000"
                >
                  {s.botLabel}
                </text>
              </g>
            </g>
          ))}*/}
        </g>
        <style>{`text { user-select: none; -webkit-user-select: none; }`}</style>
        <style>
          {`
           .cell-rect {
             transition: fill 0.1s ease;
             cursor: pointer;
           }
           .cell-rect:hover {
           fill: #f88;
           }
           `}
         </style>
      </svg>
    </div>
  );
};
