import { createFileRoute } from "@tanstack/solid-router";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    on,
    onMount,
    Show,
    untrack,
} from "solid-js";
import { Replicache, type WriteTransaction } from "replicache";
import { createWindowVirtualizer } from "@tanstack/solid-virtual";
import MiniSearch, { type SearchResult } from "minisearch";
import { type Marks } from "@comifuro/core/types";

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

const createTweetsReplicache = (apiHost: string) => {
    return new Replicache({
        name: "tweets",
        pullURL: `${apiHost}/replicache/tweets/pull`,
        logLevel: "debug",
    });
};

const createOfflineMarksReplicache = () => {
    return new Replicache({
        name: "marks",
        logLevel: "debug",
        mutators: {
            async markTweet(
                tx: WriteTransaction,
                { id, mark, user }: { id: string; mark: string; user?: string },
            ) {
                await tx.set(`message/${id}`, {
                    mark,
                    user,
                });
            },
            async removeTweet(tx: WriteTransaction, id: string) {
                await tx.del(`message/${id}`);
            },
        },
    });
};

const createMarksReplicache = (apiHost: string, auth: string) => {
    return new Replicache({
        name: "marks",
        pullURL: `${apiHost}/replicache/pull`,
        pushURL: `${apiHost}/replicache/push`,
        logLevel: "debug",
        mutators: {
            async markTweet(
                tx: WriteTransaction,
                { id, mark, user }: { id: string; mark: string; user?: string },
            ) {
                await tx.set(`message/${id}`, {
                    mark,
                    user,
                });
            },
            async removeTweet(tx: WriteTransaction, id: string) {
                await tx.del(`message/${id}`);
            },
        },
        auth,
    });
};

type TweetsReplicache = ReturnType<typeof createTweetsReplicache>;
type MarksReplicache = ReturnType<typeof createMarksReplicache>;

const dbName = "ms";
const storeName = "cache";
const keyName = "ms";

function RouteComponent() {
    const [tweetsReplicache, setTweetsReplicache] =
        createSignal<TweetsReplicache | null>(null);
    const [marksReplicache, setMarksReplicache] =
        createSignal<MarksReplicache | null>(null);
    const [tweets, setTweets] = createSignal<(Tweet & { id: string })[]>([]);

    const [searchValue, setSearchValue] = createSignal("");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const [isProcessingIndex, setIsProcessingIndex] = createSignal(false);

    const [miniSearch, setMiniSearch] = createSignal<MiniSearch | null>(null);

    // tweets replicache
    onMount(async () => {
        const apiHost = getApiHost(window.location.href);

        const tReplicache = createTweetsReplicache(apiHost);

        if (tReplicache) {
            tReplicache.subscribe(
                async (tx) =>
                    (await tx.scan().entries().toArray()) as [string, Tweet][],
                {
                    onData: (list) => {
                        setTweets(
                            list
                                .map(([id, tweet]) => ({ ...tweet, id }))
                                .reverse(),
                        );
                        tReplicache.pull();
                    },
                },
            );

            console.log("listening");
        }

        const open = indexedDB.open(dbName);
        await new Promise((res, rej) => {
            open.onupgradeneeded = () => {
                open.result.createObjectStore(storeName);
            };
            open.onsuccess = () => res(undefined);
            open.onerror = () => rej(open.error);
        });

        const db = open.result;
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(keyName);

        const data: string | undefined = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });

        db.close();
        if (!data) {
            setMiniSearch(
                new MiniSearch({
                    fields: ["user", "text"], // fields to index for full-text search
                    storeFields: [
                        "user",
                        "text",
                        "timestamp",
                        "imageMask",
                        "id",
                    ], // fields to return with search results
                }),
            );
        } else {
            // @ts-ignore - depends on your MiniSearch import
            const miniSearchInstance = await (MiniSearch as any).loadJSONAsync(
                data,
                {
                    fields: ["user", "text"], // fields to index for full-text search
                    storeFields: [
                        "user",
                        "text",
                        "timestamp",
                        "imageMask",
                        "id",
                    ], // fields to return with search result;
                },
            );
            setMiniSearch(miniSearchInstance as any);
        }

        setTweetsReplicache(tReplicache);

        return () => {
            void tweetsReplicache()?.close();
        };
    });

    const [marks, setMarks] = createSignal<[string, { mark: Marks }][]>([]);

    onMount(() => {
        const mReplicache = createOfflineMarksReplicache();

        if (mReplicache) {
            mReplicache.subscribe(
                async (tx) =>
                    (await tx.scan().entries().toArray()) as [
                        string,
                        { mark: Marks },
                    ][],
                {
                    onData: (list) => {
                        console.log("marks list", list);
                        setMarks(list);
                        mReplicache.pull();
                    },
                },
            );
        }

        setMarksReplicache(mReplicache);

        return () => {
            void marksReplicache()?.close();
        };
    });

    // marks replicache
    const setupOnlineMarksReplicache = () => {
        const apiHost = getApiHost(window.location.href);

        const mReplicache = createMarksReplicache(apiHost, "izmeeeee");
        setMarksReplicache(mReplicache);

        listen(mReplicache);
    };

    const processIndex = async () => {
        setIsProcessingIndex(true);
        const t = tweets();

        console.log("processing", t.length);

        for (const tweet of t) {
            const ms = miniSearch();
            if (!ms?.has(tweet.id)) ms?.add(tweet);
        }
        setIsProcessingIndex(false);

        console.log("done processing");
    };

    createEffect(
        on(
            tweets,
            (t, prev) => {
                const miniSearchCopy = miniSearch();
                if (!miniSearchCopy) return;

                if (debounceTimer) return;

                if (!isProcessingIndex) processIndex();
                else
                    debounceTimer = setTimeout(() => {
                        processIndex();
                        debounceTimer = null;
                    }, 1000);
            },
            { defer: true },
        ),
    );

    const isDoneProcessing = () => {
        if (!isProcessingIndex()) {
            const tCopy = tweets();
            const ms = miniSearch();
            if (!tCopy || !ms) return false;
            return tCopy.length === ms.documentCount;
        }
        return false;
    };

    createEffect(
        on(isDoneProcessing, async (r) => {
            if (r) {
                console.log("store ms cache");
                const ms = miniSearch();
                if (!ms) return;
                const json = ms.toJSON(); // plain object
                const data = JSON.stringify(json); // or store json directly via structured-clone
                const open = indexedDB.open(dbName);

                await new Promise((res, rej) => {
                    open.onupgradeneeded = () => {
                        open.result.createObjectStore(storeName);
                    };
                    open.onsuccess = () => res(undefined);
                    open.onerror = () => rej(open.error);
                });

                const db = open.result;
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                store.put(data, keyName);
                await new Promise((res, rej) => {
                    tx.oncomplete = () => res(undefined);
                    tx.onerror = () => rej(tx.error);
                });
                db.close();
            }
        }),
    );

    const filtered = createMemo(() => {
        const miniSearchCopy = untrack(() => miniSearch());

        const filter = searchValue();

        if (!filter || !miniSearchCopy) {
            console.log("no minisearch");
            return tweets();
        }

        const words = filter.split(" ");

        let results = miniSearchCopy.search(
            { combineWith: "AND", queries: words },
            {
                prefix: true,
            },
        );
        console.log("results", results.length, miniSearchCopy.documentCount);
        return results as unknown as (Tweet & { id: string })[];
    });

    return (
        <div>
            <p>
                total tweets: {tweets().length}{" "}
                {isDoneProcessing() ? "v" : "..."}
            </p>
            <p>filtered: {filtered().length}</p>
            <For each={marks()}>
                {(mark) => (
                    <p>
                        {mark[0]}: {mark[1].mark}
                    </p>
                )}
            </For>
            <div>
                search:
                <input
                    class="p-1 rounded border"
                    type="text"
                    value={searchValue()}
                    oninput={(e) => setSearchValue(e.target.value)}
                />
            </div>
            <Show when={tweets().length > 0}>
                <Tweets tweets={filtered()} replicache={marksReplicache()} />
            </Show>
        </div>
    );
}

function Tweets(props: {
    tweets: (Tweet & { id: string })[];
    replicache: MarksReplicache | null;
}) {
    let parentRef!: HTMLDivElement;

    const virtual = createMemo(() => {
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
                                            virtual().measureElement(el),
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
                                        <div>Row {virtualRow.index}</div>
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
                                                                    .imageMask,
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

                                                    <div class="flex gap-2">
                                                        <button
                                                            class="cursor-pointer"
                                                            onclick={async () => {
                                                                await props.replicache?.mutate.markTweet(
                                                                    {
                                                                        id: tweet()
                                                                            .id,
                                                                        mark: "ignore",
                                                                    },
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
                                                                        id: tweet()
                                                                            .id,
                                                                        mark: "bookmark",
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            mark bookmark
                                                        </button>
                                                        <button
                                                            class="cursor-pointer"
                                                            onclick={async () => {
                                                                await props.replicache?.mutate.removeTweet(
                                                                    tweet().id,
                                                                );
                                                            }}
                                                        >
                                                            mark bookmark
                                                        </button>
                                                    </div>
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
