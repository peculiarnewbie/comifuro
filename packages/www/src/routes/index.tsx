import { A } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import Tweet from "~/components/tweet";
import * as R from "remeda";

export type Metadata = {
    user: string;
    text: string;
    url: string;
    images: number[];
};

import { Mason, createMasonryBreakpoints } from "solid-mason";

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
            R.map(([k, v]) => [k, JSON.parse(v)])
        );
    });

    const [filter, setFilter] = createSignal<{ word: string | null }>({
        word: null,
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
            R.take(50),
            R.map(([k, v]) => {
                return { tweet: [k, v], height: 0 };
            })
        ) as {
            tweet: [string, Metadata];
            height: number;
        }[];
    };

    const [counter, setCounter] = createSignal(0);

    return (
        <main class="text-center mx-auto text-gray-700 p-4">
            <input
                type="text"
                placeholder="Filter"
                oninput={(e) => setFilter({ word: e.target.value })}
            />
            <div>total: {data()?.length}</div>
            <div>filtered: {filteredCount()}</div>
            <Show when={data()}>
                <Mason as="div" items={filtered()} columns={breakpoints()}>
                    {(item, index) => <Tweet tweet={item.tweet} />}
                </Mason>
            </Show>
        </main>
    );
}
