import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, onMount, Show } from "solid-js";
import { Replicache, type WriteTransaction } from "replicache";
import {
    createVirtualizer,
    createWindowVirtualizer,
} from "@tanstack/solid-virtual";

export const Route = createFileRoute("/replicache")({
    component: RouteComponent,
});

function listen(rep: Replicache) {
    // TODO: listen to changes on server
}

type Tweet = {
    user: string;
    timestamp: string;
    text: string;
    imageMask: number;
};

function RouteComponent() {
    const [r, setR] = createSignal<Replicache<any> | null>(null);
    const [tweets, setTweets] = createSignal<(Tweet & { id: string })[]>([]);

    onMount(async () => {
        const replicache = new Replicache({
            name: "tweets",
            pullURL: "https://api.cf.peculiarnewbie.com/replicache/pull",
            logLevel: "debug",
        });
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
                <Tweets tweets={tweets()} />
            </Show>
        </div>
    );
}

function Tweets(props: { tweets: Tweet[] }) {
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
                                    <div>
                                        {JSON.stringify(
                                            props.tweets[virtualRow.index]
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
