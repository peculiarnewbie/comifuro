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

    const filtered = () => {
        const filters = filter();
        const allData = data();
        if (!allData) return [];
        return R.pipe(
            allData,
            R.filter(([k, v]) => {
                if (filters.word) {
                    return v.text.includes(filters.word);
                }
                return true;
            }),
            R.take(10)
        ) as [string, Metadata][];
    };

    const [counter, setCounter] = createSignal(0);

    return (
        <main class="text-center mx-auto text-gray-700 p-4">
            <input
                type="text"
                placeholder="Filter"
                oninput={(e) => setFilter({ word: e.target.value })}
            />
            <Show when={data()}>
                {filtered().map((tweet) => (
                    <Tweet tweet={tweet} />
                ))}
            </Show>
            <button onclick={() => setCounter((c) => c + 1)}>Next</button>
        </main>
    );
}
