import { A } from "@solidjs/router";
import {
    createEffect,
    createResource,
    createSignal,
    onMount,
    Show,
} from "solid-js";
import Tweet from "~/components/tweet";
import * as R from "remeda";
import { Mason, createMasonryBreakpoints } from "solid-mason";

export type Metadata = {
    user: string;
    text: string;
    url: string;
    images: number[];
};

const breakpoints = createMasonryBreakpoints(() => [
    { query: "(min-width: 1536px)", columns: 4 },
    { query: "(min-width: 1280px) and (max-width: 1536px)", columns: 3 },
    { query: "(min-width: 768px) and (max-width: 1280px)", columns: 2 },
    { query: "(max-width: 768px)", columns: 1 },
]);

export default function Home() {
    const [data] = createResource(async () => {
        const res = await fetch(
            "https://r2.comifuro.peculiarnewbie.com/tweets.json.gz"
        );

        const compressedStream = res.body;

        if (!compressedStream) {
            return [];
        }

        const decompressionStream = new DecompressionStream("gzip");

        const decompressedStream =
            compressedStream.pipeThrough(decompressionStream);

        const decompressedResponse = new Response(decompressedStream);
        const json = (await decompressedResponse.json()) as Record<
            string,
            string
        >;

        return R.pipe(
            json,
            R.entries(),
            R.map(([k, v]) => [k, v])
        );
    });

    const [filter, setFilter] = createSignal<{
        word: string | null;
        limit: number;
        dummy: number;
    }>({
        word: null,
        limit: 20,
        dummy: 0,
    });
    const [filteredCount, setFilteredCount] = createSignal(0);

    const filtered = () => {
        const filters = filter();
        const allData = data();
        if (!allData) return [];
        return R.pipe(
            allData,
            R.filter(([k, v]) => {
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
            })
        ) as {
            tweet: [string, Metadata];
            height: number;
        }[];
    };

    function debounce<T extends (...args: any[]) => void>(
        fn: T,
        delay: number
    ) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return (...args: Parameters<T>) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    const recalculate = () => {
        const currentFilters = filter();
        setFilter({
            ...currentFilters,
            limit: currentFilters.limit + 1,
        });
        console.log(filter().dummy);
    };

    const debounceRecalculate = debounce(recalculate, 2000);
    //   const debounceFilterInput = debounce(filterLogic, 300);

    onMount(() => {
        debounceRecalculate();
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
                    debounceRecalculate();
                }}
            />
            <div>total: {data()?.length}</div>
            <div>filtered: {filteredCount()}</div>
            <Show when={data()}>
                <Mason as="div" items={filtered()} columns={breakpoints()}>
                    {(item, index) => (
                        <Tweet
                            tweet={item.tweet}
                            // onImageLoad={() => debounceRecalculate()}
                        />
                    )}
                </Mason>
            </Show>
            <button
                onclick={() => {
                    const currentFilters = filter();
                    setFilter({
                        ...currentFilters,
                        limit: currentFilters.limit + 20,
                    });
                    debounceRecalculate();
                }}
            >
                more
            </button>
        </main>
    );
}
