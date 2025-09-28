import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, onMount, Show } from "solid-js";
import { Replicache, type WriteTransaction } from "replicache";
import { createVirtualizer } from "@tanstack/solid-virtual";

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
                        setTweets(
                            list.map(([id, tweet]) => ({ ...tweet, id }))
                        );
                    },
                }
            );

            console.log("listening");
        }

        return () => {
            void r()?.close();
        };
    });
    return (
        <div>
            <Show when={tweets().length > 0}>
                <Tweets tweets={tweets()} r={r()} />
            </Show>
        </div>
    );
}

function Tweets(props: { tweets: Tweet[]; r: MyReplicache | null }) {
    let parentRef!: HTMLDivElement;

    const virtual = createVirtualizer({
        count: props.tweets.length,
        estimateSize: () => 210,
        getScrollElement: () => parentRef,
        overscan: 5,
    });

    const items = virtual.getVirtualItems();

    onMount(() => {
        console.log("tweets", props.tweets.length);
    });

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
                        height: `${virtual.getTotalSize()}px`,
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
                            transform: `translateY(${items[0] ? items[0].start : 0}px)`,
                        }}
                    >
                        {items.map((virtualRow) => (
                            <div
                                data-index={virtualRow.index}
                                ref={(el) =>
                                    queueMicrotask(() =>
                                        virtual.measureElement(el)
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
                                        height: "200px",
                                    }}
                                >
                                    <div>Row {virtualRow.index}</div>
                                    <button
                                        class="cursor-pointer"
                                        onclick={async () => {
                                            await props.r?.mutate.markTweet({
                                                id: "sup",
                                                user: "test",
                                                mark: "ignore",
                                            });
                                        }}
                                    >
                                        mark ignore
                                    </button>
                                    <button
                                        class="cursor-pointer"
                                        onclick={async () => {
                                            await props.r?.mutate.markTweet({
                                                id: "sup",
                                                user: "test",
                                                mark: "bookmark",
                                            });
                                        }}
                                    >
                                        mark bookmark
                                    </button>
                                    <Show when={props.tweets[virtualRow.index]}>
                                        {(tweet) => (
                                            <div>
                                                <p>User: {tweet().user}</p>
                                                <p>
                                                    Timestamp:{" "}
                                                    {tweet().timestamp}
                                                </p>
                                                <p>Text: {tweet().text}</p>
                                                <p>
                                                    pictures:{" "}
                                                    {maskToIndices(
                                                        tweet().imageMask
                                                    ).join(", ")}
                                                </p>
                                            </div>
                                        )}
                                    </Show>
                                </div>
                            </div>
                        ))}
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
