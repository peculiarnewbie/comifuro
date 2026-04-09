import { createFileRoute } from "@tanstack/solid-router";
import MiniSearch from "minisearch";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    onCleanup,
    Show,
} from "solid-js";
import type { Marks } from "@comifuro/core/types";
import TweetCard from "../components/tweet";
import { createTweetThreadSearchText } from "../lib/tweet-search";
import {
    createMarksStoreSession,
    createTweetStoreSession,
    getApiHost,
    type CatalogueTweet,
    type CatalogueTweetThread,
    groupTweetsIntoThreads,
    type MarksStoreSession,
    type TweetStoreSession,
} from "../lib/catalogue-store";

export const Route = createFileRoute("/")({
    component: AppRouteComponent,
});

type SearchDocument = {
    id: string;
    searchText: string;
    updatedAt: number;
};

type SearchIndexState = {
    ready: boolean;
    count: number;
};

function createSearchIndex() {
    return new MiniSearch<SearchDocument>({
        fields: ["searchText"],
        storeFields: ["id", "searchText", "updatedAt"],
    });
}

function toSearchDocument(thread: CatalogueTweetThread): SearchDocument {
    return {
        id: thread.groupId,
        updatedAt: Math.max(
            thread.root.updatedAt,
            ...thread.replies.map((tweet) => tweet.updatedAt),
        ),
        searchText: createTweetThreadSearchText(thread.root, thread.replies),
    };
}

export function AppRouteComponent() {
    const [eventId, setEventId] = createSignal(
        typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
                  .get("event")
                  ?.trim()
                  .toLowerCase() || "cf22"
            : "cf22",
    );
    const [tweets, setTweets] = createSignal<CatalogueTweet[]>([]);
    const [marks, setMarks] = createSignal<Record<string, Marks>>({});
    const [syncStatus, setSyncStatus] = createSignal("idle");
    const [syncError, setSyncError] = createSignal<string | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(null);
    const [bootstrapComplete, setBootstrapComplete] = createSignal(false);
    const [searchValue, setSearchValue] = createSignal("");
    const [miniSearch, setMiniSearch] = createSignal(createSearchIndex());
    const [searchIndexState, setSearchIndexState] = createSignal<SearchIndexState>({
        ready: false,
        count: 0,
    });
    const groupedThreads = createMemo(() => groupTweetsIntoThreads(tweets()));
    const groupedThreadsById = createMemo(
        () =>
            new Map(
                groupedThreads().map((thread) => [thread.groupId, thread] as const),
            ),
    );

    let tweetSession: TweetStoreSession | null = null;
    let marksSession: MarksStoreSession | null = null;
    let indexedDocuments = new Map<string, SearchDocument>();
    let searchRevision = 0;

    createEffect(() => {
        const selectedEventId = eventId();
        if (typeof window === "undefined") {
            return;
        }

        let disposed = false;
        let unsubscribe = () => {};

        (async () => {
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
                setSyncStatus(snapshot.syncStatus);
                setSyncError(snapshot.syncError);
                setLastSyncedAt(snapshot.lastSyncedAt);
                setBootstrapComplete(snapshot.bootstrapComplete);
            });

            await nextSession.start();
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

    createEffect(() => {
        if (typeof window === "undefined" || marksSession) {
            return;
        }

        let disposed = false;
        let unsubscribe = () => {};

        (async () => {
            const nextSession = await createMarksStoreSession();
            if (disposed) {
                await nextSession.destroy();
                return;
            }

            marksSession = nextSession;
            unsubscribe = nextSession.subscribe((snapshot) => {
                setMarks(snapshot.marks);
            });
        })();

        onCleanup(() => {
            disposed = true;
            unsubscribe();
            const currentSession = marksSession;
            marksSession = null;
            if (currentSession) {
                void currentSession.destroy();
            }
        });
    });

    createEffect(() => {
        const nextThreads = groupedThreads();
        const nextRevision = ++searchRevision;
        const nextIndex = miniSearch();
        const nextDocuments = new Map(
            nextThreads.map((thread) => {
                const document = toSearchDocument(thread);
                return [thread.groupId, document] satisfies [string, SearchDocument];
            }),
        );

        setSearchIndexState({
            ready: false,
            count: nextThreads.length,
        });

        void (async () => {
            const removedIds = [...indexedDocuments.keys()].filter(
                (id) => !nextDocuments.has(id),
            );

            for (const tweetId of removedIds) {
                if (nextRevision !== searchRevision) {
                    return;
                }

                if (nextIndex.has(tweetId)) {
                    nextIndex.discard(tweetId);
                }
            }

            let processed = 0;
            for (const [tweetId, tweet] of nextDocuments.entries()) {
                if (nextRevision !== searchRevision) {
                    return;
                }

                const previous = indexedDocuments.get(tweetId);
                if (!previous) {
                    nextIndex.add(tweet);
                } else if (
                    previous.searchText !== tweet.searchText ||
                    previous.updatedAt !== tweet.updatedAt
                ) {
                    if (nextIndex.has(tweetId)) {
                        nextIndex.replace(tweet);
                    } else {
                        nextIndex.add(tweet);
                    }
                }

                processed += 1;
                if (processed % 200 === 0) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }
            }

            indexedDocuments = nextDocuments;
            setSearchIndexState({
                ready: true,
                count: nextIndex.documentCount,
            });
        })();
    });

    const filteredThreads = createMemo(() => {
        const filter = searchValue().trim();
        if (!filter) {
            return groupedThreads();
        }

        const search = miniSearch();
        if (!searchIndexState().ready) {
            return groupedThreads();
        }

        const queries = filter
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean);
        if (queries.length === 0) {
            return groupedThreads();
        }

        const threadMap = groupedThreadsById();
        return search
            .search({ combineWith: "AND", queries }, { prefix: true })
            .map((result) => threadMap.get(result.id))
            .filter((thread): thread is CatalogueTweetThread => Boolean(thread));
    });

    const setEvent = (nextEventId: string) => {
        setEventId(nextEventId);
        const url = new URL(window.location.href);
        url.searchParams.set("event", nextEventId);
        window.history.replaceState({}, "", url);
    };

    return (
        <main class="mx-auto max-w-7xl p-4 text-gray-700">
            <div class="mb-4 flex flex-wrap items-center gap-2">
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
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => {
                        void tweetSession?.syncOnce();
                    }}
                >
                    sync now
                </button>
            </div>

            <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1 text-sm">
                    <div>event: {eventId()}</div>
                    <div>tweets cached: {tweets().length}</div>
                    <div>search indexed: {searchIndexState().count}</div>
                    <div>filtered: {filteredThreads().length}</div>
                    <div>
                        sync: {syncStatus()}
                        {bootstrapComplete() ? " (ready)" : " (bootstrapping)"}
                    </div>
                    <Show when={lastSyncedAt()}>
                        {(value) => (
                            <div>
                                last sync: {new Date(value()).toLocaleString()}
                            </div>
                        )}
                    </Show>
                    <Show when={syncError()}>
                        {(message) => <div class="text-red-600">{message()}</div>}
                    </Show>
                </div>

                <input
                    type="text"
                    placeholder="Search tweets"
                    value={searchValue()}
                    onInput={(event) => setSearchValue(event.currentTarget.value)}
                    class="w-full rounded border p-2 sm:max-w-sm"
                />
            </div>

            <Show
                when={filteredThreads().length > 0}
                fallback={
                    <div class="rounded border border-dashed p-8 text-center text-sm text-gray-500">
                        {tweets().length === 0
                            ? "No tweets cached yet."
                            : "No tweets match the current search."}
                    </div>
                }
            >
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <For each={filteredThreads()}>
                        {(thread) => (
                            <TweetCard
                                thread={thread}
                                mark={marks()[thread.groupId] ?? null}
                                onMark={(mark) =>
                                    marksSession?.setMark(thread.groupId, mark)
                                }
                                onClearMark={() =>
                                    marksSession?.clearMark(thread.groupId)
                                }
                            />
                        )}
                    </For>
                </div>
            </Show>
        </main>
    );
}
