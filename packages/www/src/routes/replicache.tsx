import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { Replicache, type WriteTransaction } from "replicache";
import { createWindowVirtualizer } from "@tanstack/solid-virtual";
import MiniSearch, { type SearchResult } from "minisearch";

export const Route = createFileRoute("/replicache")({
    component: RouteComponent,
});

function listen(rep: Replicache) {
    // TODO: listen to changes on server
    console.log(rep);
}

type Tweet = {
    user: string;
    timestamp: string;
    text: string;
    imageMask: number;
};

const getApiHost = (url: string) => {
    if (url.startsWith("http://localhost")) return "http://localhost:8787";
    return "https://api.cf.peculiarnewbie.com";
};

const createReplicache = (apiHost: string) => {
    return new Replicache({
        name: "tweets",
        pullURL: `${apiHost}/replicache/pull`,
        pushURL: `${apiHost}/replicache/push`,
        logLevel: "debug",
        mutators: {
            async markTweet(
                tx: WriteTransaction,
                { id, mark, user }: { id: string; mark: string; user?: string }
            ) {
                await tx.set(`message/${id}`, {
                    mark,
                    user,
                });
            },
        },
    });
};

type MyReplicache = ReturnType<typeof createReplicache>;

function RouteComponent() {
    const [r, setR] = createSignal<MyReplicache | null>(null);
    const [tweets, setTweets] = createSignal<(Tweet & { id: string })[]>([]);
    const [filtered, setFiltered] = createSignal<SearchResult[]>([]);
    const [searchValue, setSearchValue] = createSignal("");
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    onMount(async () => {
        const apiHost = getApiHost(window.location.href);

        const replicache = createReplicache(apiHost);

        setR(replicache);
        listen(replicache);

        const rep = r();

        if (rep) {
            rep.subscribe(
                async (tx) =>
                    (await tx.scan().entries().toArray()) as [string, Tweet][],
                {
                    onData: (list) => {
                        const currentTweetLength = tweets().length;
                        setTweets(
                            list
                                .map(([id, tweet]) => ({ ...tweet, id }))
                                .filter((t) => t.imageMask !== 0)
                                .reverse()
                        );
                        if (list.length > currentTweetLength) {
                            rep.pull();
                        }
                    },
                }
            );

            console.log("listening");
        }

        return () => {
            void r()?.close();
        };
    });

    const filterTweets = (filter: string) => {
        if (!filter) {
            //@ts-expect-error
            setFiltered(tweets());
            return;
        }
        let miniSearch = new MiniSearch({
            fields: ["user", "text"], // fields to index for full-text search
            storeFields: ["user", "text", "timestamp", "imageMask", "id"], // fields to return with search results
        });
        miniSearch.addAll(tweets());
        let results = miniSearch.search(filter, {
            prefix: true,
        });
        setFiltered(results);
    };

    const handleSearchInput = (value: string) => {
        setSearchValue(value);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            filterTweets(value);
        }, 100);
    };

    return (
        <div>
            <p>total tweets: {tweets().length}</p>
            <p>filtered: {filtered().length}</p>
            <div>
                search:
                <input
                    class="p-1 rounded border"
                    type="text"
                    value={searchValue()}
                    oninput={(e) => handleSearchInput(e.target.value)}
                />
            </div>
            <Show when={tweets().length > 0}>
                <Tweets
                    tweets={
                        //@ts-expect-error
                        filtered() as (Tweet & { id: string })[]
                    }
                    replicache={r()}
                />
            </Show>
        </div>
    );
}

function Tweets(props: {
    tweets: (Tweet & { id: string })[];
    replicache: MyReplicache | null;
}) {
    let parentRef!: HTMLDivElement;

    const virtual = createMemo(() => {
        console.log("creating virtualizer", props.tweets.length);
        return createWindowVirtualizer({
            count: props.tweets.length,
            estimateSize: () => 410,
            overscan: 5,
        });
    });

    const items = () => virtual().getVirtualItems();

    return (
        <div>
            <div
                ref={parentRef}
                class="List"
                style={{
                    "overflow-y": "auto",
                    height: "screen-h",
                }}
            >
                <div
                    style={{
                        height: `${virtual().getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${items()[0] ? items()[0].start : 0}px)`,
                        }}
                    >
                        <For each={items()}>
                            {(virtualRow) => (
                                <div
                                    data-index={virtualRow.index}
                                    ref={(el) =>
                                        queueMicrotask(() =>
                                            virtual().measureElement(el)
                                        )
                                    }
                                    class={
                                        virtualRow.index % 2
                                            ? "ListItemOdd"
                                            : "ListItemEven"
                                    }
                                >
                                    <div
                                        style={{
                                            padding: "10px 0",
                                            height: "390px",
                                        }}
                                    >
                                        {/* <div>Row {virtualRow.index}</div>
                                        <button
                                            class="cursor-pointer"
                                            onclick={async () => {
                                                await props.replicache?.mutate.markTweet(
                                                    {
                                                        id: "sup",
                                                        user: "test",
                                                        mark: "ignore",
                                                    }
                                                );
                                            }}
                                        >
                                            mark ignore
                                        </button>
                                        <button
                                            class="cursor-pointer"
                                            onclick={async () => {
                                                await props.replicache?.mutate.markTweet(
                                                    {
                                                        id: "sup",
                                                        user: "test",
                                                        mark: "bookmark",
                                                    }
                                                );
                                            }}
                                        >
                                            mark bookmark
                                        </button> */}
                                        <Show
                                            when={
                                                props.tweets[virtualRow.index]
                                            }
                                        >
                                            {(tweet) => (
                                                <div>
                                                    <p>User: {tweet().user}</p>
                                                    <p>
                                                        Timestamp:{" "}
                                                        {tweet().timestamp}
                                                    </p>
                                                    <p>Text: {tweet().text}</p>
                                                    <div>
                                                        pictures:{" "}
                                                        <div class="flex h-[200px] w-full overflow-hidden">
                                                            {maskToIndices(
                                                                tweet()
                                                                    .imageMask
                                                            ).map((x) => (
                                                                <img
                                                                    class="h-full w-auto object-contain"
                                                                    src={`https://r2.comifuro.peculiarnewbie.com/${tweet().id}/${x}.webp`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <a
                                                        href={`https://x.com/${tweet().user}/status/${tweet().id}`}
                                                        target="_blank"
                                                        class="text-blue-400"
                                                    >
                                                        view on twitter
                                                    </a>
                                                </div>
                                            )}
                                        </Show>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function maskToIndices(mask: number, maxBits = 5): number[] {
    const indices: number[] = [];
    for (let i = 0; i < maxBits; i++) {
        if ((mask & (1 << i)) !== 0) indices.push(i);
    }
    return indices;
}
