import { For } from "solid-js";

function SubBooth(props: {
    rowY: number;
    position: [number, number];
    cellSize: number;
    label: "a" | "b";
    booth: number;
}) {
    const [x, y] = props.position;
    return (
        <>
            <rect
                x={x * props.cellSize}
                y={y * props.cellSize + props.rowY}
                width={props.cellSize}
                height={props.cellSize}
                fill={props.label === "a" ? "#eaf3ff" : "#fff"}
                stroke="#000"
                stroke-width="0.5"
                class="cell-rect"
                onmousedown={() => console.log(props.booth, props.label)}
            />
            <text
                x={props.cellSize * (0.35 + x)}
                y={props.rowY + props.cellSize * (0.75 + y)}
                font-size="10"
                fill="#000"
                font-family="ui-sans-serif, system-ui, Arial"
                class="hover-text"
                style={{ "pointer-events": "none" }}
            >
                {props.label}
            </text>
        </>
    );
}

function VerticalBooth(props: {
    rowY: number;
    cellSize: number;
    booth: number;
    left?: boolean;
}) {
    return (
        <>
            <rect
                x={props.cellSize * (props.left ? 1 : 2)}
                y={props.rowY}
                width={props.cellSize}
                height={props.cellSize * 2}
                stroke="#000"
                fill="#fff"
                stroke-width="0.5"
                class="cell-rect"
            />
            <text
                x={props.cellSize * (props.left ? 1.85 : 2.85)}
                y={props.rowY + props.cellSize * 1.25}
                text-anchor="end"
                font-size="10"
                fill="#000"
                font-family="ui-sans-serif, system-ui, Arial"
                style={{ "pointer-events": "none" }}
            >
                {props.booth.toString().padStart(2, "0")}
            </text>
        </>
    );
}

function HorizontalBooth(props: {
    rowY: number;
    cellSize: number;
    booth: number;
    left?: boolean;
}) {
    return (
        <>
            <rect
                x={props.left ? 0 : props.cellSize * 2}
                y={props.rowY}
                width={props.cellSize * 2}
                height={props.cellSize}
                stroke="#000"
                fill="#fff"
                stroke-width="0.5"
                class="cell-rect"
            />
            <text
                x={props.cellSize * (props.left ? 1.35 : 3.35)}
                y={props.rowY + +props.cellSize * 0.75}
                text-anchor="end"
                font-size="10"
                fill="#000"
                font-family="ui-sans-serif, system-ui, Arial"
                style={{ "pointer-events": "none" }}
            >
                {props.booth.toString().padStart(2, "0")}
            </text>
        </>
    );
}

export function MiddleRow(props: {
    rowY: number;
    leftNumber: number;
    rightNumber: number;
    cellSize: number;
}) {
    return (
        <g>
            <VerticalBooth
                rowY={props.rowY}
                cellSize={props.cellSize}
                booth={props.leftNumber}
                left={true}
            />
            <VerticalBooth
                rowY={props.rowY}
                cellSize={props.cellSize}
                booth={props.rightNumber}
            />
            <For
                each={[
                    [0, 0, props.leftNumber],
                    [0, 1, props.leftNumber],
                    [3, 1, props.rightNumber],
                    [3, 0, props.rightNumber],
                ]}
            >
                {([x, y, booth], i) => (
                    <SubBooth
                        rowY={props.rowY}
                        position={[x, y]}
                        cellSize={props.cellSize}
                        label={i() % 2 === 0 ? "a" : "b"}
                        booth={booth}
                    />
                )}
            </For>
        </g>
    );
}

export function EdgeRow(props: {
    rowY: number;
    leftNumber: number;
    rightNumber: number;
    cellSize: number;
    top?: boolean;
}) {
    const subBoothY = props.top ? 0 : 1;
    const rowY = props.top ? props.rowY + props.cellSize : props.rowY;

    return (
        <g>
            <HorizontalBooth
                rowY={rowY}
                cellSize={props.cellSize}
                booth={props.leftNumber}
                left={true}
            />
            <HorizontalBooth
                rowY={rowY}
                cellSize={props.cellSize}
                booth={props.rightNumber}
            />
            <For
                each={[
                    [0, subBoothY, props.leftNumber],
                    [1, subBoothY, props.leftNumber],
                    [2, subBoothY, props.rightNumber],
                    [3, subBoothY, props.rightNumber],
                ]}
            >
                {([x, y, booth], i) => (
                    <SubBooth
                        rowY={props.rowY}
                        position={[x, y]}
                        cellSize={props.cellSize}
                        label={
                            props.top
                                ? i() % 2 === 0
                                    ? "b"
                                    : "a"
                                : i() % 2 === 0
                                  ? "a"
                                  : "b"
                        }
                        booth={booth}
                    />
                )}
            </For>
        </g>
    );
}
