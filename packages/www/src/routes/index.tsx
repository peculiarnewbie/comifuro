import { A } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import Counter from "~/components/Counter";
import Tweet from "~/components/tweet";

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
        const json = await decompressedResponse.json();

        return Object.entries(json);
    });

    const [counter, setCounter] = createSignal(0);

    return (
        <main class="text-center mx-auto text-gray-700 p-4">
            <Show when={data()}>
                <Tweet tweet={data()[counter()]} />
            </Show>
            <button onclick={() => setCounter((c) => c + 1)}>Next</button>
        </main>
    );
}
