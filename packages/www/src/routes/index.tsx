import { createFileRoute } from "@tanstack/solid-router";

import { createResource, createSignal, For, Show } from "solid-js";
import Tweet from "../components/tweet";
import * as R from "remeda";
import { createMasonry } from "@solid-primitives/masonry";
import { createBreakpoints } from "@solid-primitives/media";
import { createElementSize } from "@solid-primitives/resize-observer";

export const Route = createFileRoute("/")({
    component: App,
});

export type Metadata = {
    user: string;
    text: string;
    url: string;
    images: number[];
};

function App() {
    const [data] = createResource(async () => {
        const res = await fetch(
            "https://r2.comifuro.peculiarnewbie.com/tweets.json.gz",
        );

        const compressedStream = res.body;

        if (!compressedStream) {
            return [];
        }

        const decompressionStream = new DecompressionStream("gzip");

        const decompressedStream =
            compressedStream.pipeThrough(decompressionStream);

        const decompressedResponse = new Response(decompressedStream);
        const json = (await decompressedResponse.json()) as Record<string, any>;

        return R.pipe(
            json,
            R.entries(),
            R.map(([k, v]) => [k, v]),
        );
    });

    const [filter, setFilter] = createSignal<{
        word: string | null;
        limit: number;
    }>({
        word: null,
        limit: 20,
    });
    const [filteredCount, setFilteredCount] = createSignal(1);

    const [masonElementsRefs, setMasonElementsRefs] = createSignal<
        HTMLElement[]
    >([]);

    // const setRef = (el: HTMLElement, index: number) => {
    //     if (el) {
    //         setMasonElementsRefs((prev) => {
    //             const newArr = [...prev];
    //             newArr[index] = el;
    //             return newArr;
    //         });
    //     }
    // };

    const assignMasonElements = () => {
        const masonElements = document.querySelectorAll(".tweet");
        const elementsArray = Array.from(masonElements) as HTMLElement[];
        if (elementsArray.length === 0) setTimeout(assignMasonElements, 0);
        setMasonElementsRefs(elementsArray);
    };

    const filtered = () => {
        const filters = filter();
        const allData = data();
        if (!allData) return [];

        setTimeout(() => {
            assignMasonElements();
        }, 100);

        return R.pipe(
            allData,
            R.filter(([_, v]) => {
                if (filters.word) {
                    return v.text
                        .toLowerCase()
                        .includes(filters.word.toLowerCase());
                }
                return true;
            }),
            R.tap((x) => setFilteredCount(x.length)),
            R.take(filters.limit),
            R.map(([k, v]) => {
                return { tweet: [k, v], height: 0 };
            }),
        ) as {
            tweet: [string, Metadata];
            height: number;
        }[];
    };

    // function debounce<T extends (...args: any[]) => void>(
    //     fn: T,
    //     delay: number
    // ) {
    //     let timer: ReturnType<typeof setTimeout> | undefined;
    //     return (...args: Parameters<T>) => {
    //         if (timer) clearTimeout(timer);
    //         timer = setTimeout(() => fn(...args), delay);
    //     };
    // }

    const br = createBreakpoints({
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
    });

    const masonry = createMasonry({
        source: masonElementsRefs,
        mapHeight(item) {
            // observe the height of the element
            const size = createElementSize(item);
            // return the accessor of the height of the element
            return () => size.height ?? 100;
        },
        columns() {
            if (br.xl) return 4;
            if (br.lg) return 3;
            if (br.md) return 2;
            return 1;
        },
        mapElement: (data) => (
            <div
                class="sm:w-full md:w-1/2 lg:w-1/3 xl:w-1/4 rounded-lg"
                style={{
                    // data.height is the value returned by `mapHeight`
                    // Height of the element should always match that value.
                    height: `${data.height()}px`,
                    // The flex order of the item in the masonry
                    order: data.order(),
                    // The space needed to be filled to prevent the next item from switching columns.
                    // "margin-bottom" is just an example, you could also add this to the element's height.
                    "margin-bottom": `${data.margin()}px`,
                }}
            >
                {data.source}
            </div>
        ),
    });

    return (
        <main class="text-center mx-auto text-gray-700 p-4">
            <input
                type="text"
                placeholder="Filter"
                oninput={(e) => {
                    const currentFilters = filter();
                    setFilter({
                        ...currentFilters,
                        word: e.target.value,
                    });
                }}
                class="p-1 border"
            />
            <div>total: {data()?.length}</div>
            <div>filtered: {filteredCount()}</div>
            <Show when={filtered().length > 0}>
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        "flex-wrap": "wrap",
                        height: `${masonry.height()}px`,
                    }}
                >
                    {masonry()}
                </div>
                <For ref={masonElementsRefs} each={filtered()}>
                    {(item) => (
                        <Tweet
                            tweet={item.tweet}
                            // onImageLoad={() => debounceRecalculate()}
                        />
                    )}
                </For>
            </Show>
            {/* {filtered().map((item, index) => (
                    <Tweet
                        ref={(el: HTMLElement) => setRef(el, index)}
                        tweet={item.tweet}
                    />
                ))} */}
            <button
                onclick={() => {
                    const currentFilters = filter();
                    setFilter({
                        ...currentFilters,
                        limit: currentFilters.limit + 20,
                    });
                }}
                class="p-2 bg-blue-400 text-2xl hover:cursor-pointer rounded text-white"
            >
                more
            </button>
        </main>
    );
}
