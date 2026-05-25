import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
    createTweetStoreSession,
    getApiHost,
    type CatalogueTweet,
    type TweetStoreSession,
} from "../lib/catalogue-store";

type TagRow = {
    tag: string;
    count: number;
    source: "matched tag" | "fandom" | "booth";
};

function readEventId() {
    if (typeof window === "undefined") {
        return "cf22";
    }

    return new URLSearchParams(window.location.search).get("event")?.trim().toLowerCase() || "cf22";
}

function buildTagRows(tweets: CatalogueTweet[]) {
    const counts = new Map<string, TagRow>();
    const add = (tag: string | null | undefined, source: TagRow["source"]) => {
        const normalized = tag?.trim();
        if (!normalized) {
            return;
        }

        const key = `${source}:${normalized.toLowerCase()}`;
        const current = counts.get(key);
        if (current) {
            current.count += 1;
            return;
        }

        counts.set(key, {
            tag: normalized,
            count: 1,
            source,
        });
    };

    for (const tweet of tweets) {
        tweet.matchedTags.forEach((tag) => add(tag, "matched tag"));
        tweet.inferredFandoms.forEach((tag) => add(tag, "fandom"));
        add(tweet.inferredBoothId, "booth");
    }

    return [...counts.values()].sort((left, right) => {
        if (right.count !== left.count) {
            return right.count - left.count;
        }

        return left.tag.localeCompare(right.tag);
    });
}

function TagsRouteComponent() {
    const [eventId, setEventId] = createSignal(readEventId());
    const [tweets, setTweets] = createSignal<CatalogueTweet[]>([]);
    const [query, setQuery] = createSignal("");
    const [loaded, setLoaded] = createSignal(false);
    let tweetSession: TweetStoreSession | null = null;

    createEffect(() => {
        const selectedEventId = eventId();
        if (typeof window === "undefined") {
            return;
        }

        let disposed = false;
        let unsubscribe = () => {};

        void (async () => {
            const nextSession = await createTweetStoreSession({
                eventId: selectedEventId,
                apiHost: getApiHost(window.location.href),
            });

            if (disposed) {
                await nextSession.destroy();
                return;
            }

            tweetSession = nextSession;
            unsubscribe = nextSession.subscribe((snapshot) => {
                setTweets(snapshot.tweets);
                setLoaded(true);
            });
        })();

        onCleanup(() => {
            disposed = true;
            unsubscribe();
            const currentSession = tweetSession;
            tweetSession = null;
            if (currentSession) {
                void currentSession.destroy();
            }
        });
    });

    const rows = createMemo(() => buildTagRows(tweets()));
    const filteredRows = createMemo(() => {
        const needle = query().trim().toLowerCase();
        if (!needle) {
            return rows();
        }

        return rows().filter(
            (row) =>
                row.tag.toLowerCase().includes(needle) || row.source.toLowerCase().includes(needle),
        );
    });

    const setEvent = (nextEventId: string) => {
        setEventId(nextEventId);
        setLoaded(false);
        const url = new URL(window.location.href);
        url.searchParams.set("event", nextEventId);
        window.history.replaceState({}, "", url);
    };

    return (
        <main class="mx-auto max-w-5xl p-4 text-gray-800">
            <div class="mb-5 flex flex-wrap items-center gap-2">
                <a class="rounded border px-3 py-1" href={`/?event=${eventId()}`}>
                    catalogue
                </a>
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => setEvent("cf22")}
                >
                    cf22
                </button>
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => setEvent("cf21")}
                >
                    cf21
                </button>
            </div>

            <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 class="text-2xl font-semibold">Local tags</h1>
                    <p class="text-sm text-gray-500">
                        Loaded from this browser cache only. No server sync is started here.
                    </p>
                    <p class="mt-2 text-sm">
                        event: {eventId()} · tweets cached: {tweets().length} · tags:{" "}
                        {rows().length}
                    </p>
                </div>
                <input
                    class="w-full rounded border p-2 sm:max-w-xs"
                    value={query()}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                    placeholder="Filter tags"
                />
            </div>

            <Show
                when={loaded() && filteredRows().length > 0}
                fallback={
                    <div class="rounded border border-dashed p-8 text-center text-sm text-gray-500">
                        {loaded() ? "No tags found in local cache." : "Loading local cache..."}
                    </div>
                }
            >
                <div class="overflow-hidden rounded border">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                            <tr>
                                <th class="px-3 py-2">Tag</th>
                                <th class="px-3 py-2">Source</th>
                                <th class="px-3 py-2 text-right">Tweets</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={filteredRows()}>
                                {(row) => (
                                    <tr class="border-t">
                                        <td class="px-3 py-2 font-medium">{row.tag}</td>
                                        <td class="px-3 py-2 text-gray-500">{row.source}</td>
                                        <td class="px-3 py-2 text-right tabular-nums">
                                            {row.count}
                                        </td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>
        </main>
    );
}

export const Route = createFileRoute("/tags")({
    component: TagsRouteComponent,
});
