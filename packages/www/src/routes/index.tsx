import { createFileRoute } from "@tanstack/solid-router";
import MiniSearch from "minisearch";
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
} from "solid-js";
import type { Marks } from "@comifuro/core/types";
import TweetCard from "../components/tweet";
import {
    createMarksStoreSession,
    createTweetStoreSession,
    getApiHost,
    groupTweetsIntoThreads,
    type CatalogueTweet,
    type CatalogueTweetThread,
    type MarksStoreSession,
    type TweetStoreSession,
} from "../lib/catalogue-store";
import {
    parseTagInput,
    removeFollowUpTweet,
    rerootThread,
    uncatalogueTweet,
    updateTweetMetadata,
} from "../lib/admin-api";
import { createTweetThreadSearchText } from "../lib/tweet-search";

export const Route = createFileRoute("/")({
    component: AppRouteComponent,
});

const PASSWORD_STORAGE_KEY = "comifuro-admin-password";
const MEDIA_HOST = "https://r2.comifuro.peculiarnewbie.com";

type SearchDocument = {
    id: string;
    searchText: string;
    updatedAt: number;
};

type SearchIndexState = {
    ready: boolean;
    count: number;
};

type StatusBanner = {
    tone: "success" | "error" | "info";
    message: string;
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

function readAdminFlag() {
    if (typeof window === "undefined") {
        return false;
    }

    const value = new URLSearchParams(window.location.search).get("admin");
    return value === "1" || value === "true";
}

const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleString();

const createImageUrl = (image: string) => `${MEDIA_HOST}/${image}`;

function statusClass(tone: StatusBanner["tone"]) {
    switch (tone) {
        case "success":
            return "border-emerald-300/70 bg-emerald-50 text-emerald-900";
        case "error":
            return "border-rose-300/70 bg-rose-50 text-rose-900";
        default:
            return "border-amber-300/70 bg-amber-50 text-amber-950";
    }
}

function buttonClass(tone: "primary" | "subtle" | "danger") {
    switch (tone) {
        case "primary":
            return "border-stone-900 bg-stone-900 text-stone-50 hover:bg-stone-800";
        case "danger":
            return "border-rose-700 bg-rose-700 text-white hover:bg-rose-600";
        default:
            return "border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50";
    }
}

function ActionButton(props: {
    label: string;
    tone?: "primary" | "subtle" | "danger";
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={props.disabled}
            class={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass(
                props.tone ?? "subtle",
            )}`}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}

function AdminTweetRow(props: {
    tweet: CatalogueTweet;
    label: string;
    pendingKeys: Record<string, boolean>;
    onSaveFandoms: (tweetId: string, value: string) => Promise<void>;
    onSaveTags: (tweetId: string, value: string) => Promise<void>;
    onMakeRoot?: (tweetId: string) => Promise<void>;
    onUncatalogue: (tweetId: string) => Promise<void>;
    onRemoveFollowUp?: (tweetId: string) => Promise<void>;
}) {
    const [fandomDraft, setFandomDraft] = createSignal("");
    const [tagDraft, setTagDraft] = createSignal("");

    createEffect(() => {
        setFandomDraft(props.tweet.inferredFandoms.join(", "));
        setTagDraft(props.tweet.matchedTags.join(", "));
    });

    const firstImage = () => props.tweet.images[0];

    return (
        <section class="rounded-[1.5rem] border border-stone-200 bg-white/90 p-4 shadow-[0_20px_60px_-50px_rgba(41,37,36,0.45)]">
            <div class="flex flex-col gap-4 xl:flex-row">
                <div class="flex items-start gap-4 xl:w-[16rem] xl:flex-none">
                    <div class="relative overflow-hidden rounded-[1.25rem] border border-stone-200 bg-stone-100">
                        <Show
                            when={firstImage()}
                            fallback={
                                <div class="flex h-28 w-24 items-center justify-center px-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                    no image
                                </div>
                            }
                        >
                            {(image) => (
                                <img
                                    class="h-28 w-24 object-cover"
                                    src={createImageUrl(image())}
                                    alt=""
                                    loading="lazy"
                                />
                            )}
                        </Show>
                    </div>
                    <div class="min-w-0 space-y-2">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                            {props.label}
                        </div>
                        <div class="font-[Georgia,_serif] text-lg leading-none text-stone-900">
                            @{props.tweet.user}
                        </div>
                        <div class="text-xs text-stone-500">
                            {formatTimestamp(props.tweet.timestamp)}
                        </div>
                        <a
                            href={props.tweet.tweetUrl}
                            target="_blank"
                            rel="noreferrer"
                            class="inline-flex rounded-full border border-stone-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500"
                        >
                            open tweet
                        </a>
                    </div>
                </div>

                <div class="min-w-0 flex-1 space-y-4">
                    <p class="text-sm leading-7 text-stone-700">{props.tweet.text}</p>

                    <div class="grid gap-4 xl:grid-cols-2">
                        <div class="space-y-2 rounded-[1.25rem] border border-stone-200 bg-stone-50/80 p-3">
                            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                fandoms
                            </div>
                            <textarea
                                rows={3}
                                value={fandomDraft()}
                                onInput={(event) =>
                                    setFandomDraft(event.currentTarget.value)
                                }
                                class="min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                                placeholder="Blue Archive, Uma Musume"
                            />
                            <div class="flex flex-wrap gap-2">
                                <ActionButton
                                    label={
                                        props.pendingKeys[`fandom:${props.tweet.id}`]
                                            ? "saving"
                                            : "save fandoms"
                                    }
                                    tone="primary"
                                    disabled={props.pendingKeys[`fandom:${props.tweet.id}`]}
                                    onClick={() =>
                                        void props.onSaveFandoms(
                                            props.tweet.id,
                                            fandomDraft(),
                                        )
                                    }
                                />
                                <For each={props.tweet.inferredFandoms}>
                                    {(tag) => (
                                        <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
                                            {tag}
                                        </span>
                                    )}
                                </For>
                            </div>
                        </div>

                        <div class="space-y-2 rounded-[1.25rem] border border-stone-200 bg-stone-50/80 p-3">
                            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                manual tags
                            </div>
                            <textarea
                                rows={3}
                                value={tagDraft()}
                                onInput={(event) => setTagDraft(event.currentTarget.value)}
                                class="min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                                placeholder="#cf22, featured"
                            />
                            <div class="flex flex-wrap gap-2">
                                <ActionButton
                                    label={
                                        props.pendingKeys[`tags:${props.tweet.id}`]
                                            ? "saving"
                                            : "save tags"
                                    }
                                    tone="primary"
                                    disabled={props.pendingKeys[`tags:${props.tweet.id}`]}
                                    onClick={() =>
                                        void props.onSaveTags(props.tweet.id, tagDraft())
                                    }
                                />
                                <For each={props.tweet.matchedTags}>
                                    {(tag) => (
                                        <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
                                            {tag}
                                        </span>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <Show when={props.onMakeRoot}>
                            <ActionButton
                                label={
                                    props.pendingKeys[`reroot:${props.tweet.id}`]
                                        ? "updating"
                                        : "make root"
                                }
                                tone="subtle"
                                disabled={props.pendingKeys[`reroot:${props.tweet.id}`]}
                                onClick={() => void props.onMakeRoot?.(props.tweet.id)}
                            />
                        </Show>
                        <ActionButton
                            label={
                                props.pendingKeys[`uncatalogue:${props.tweet.id}`]
                                    ? "updating"
                                    : "uncatalogue"
                            }
                            tone="danger"
                            disabled={props.pendingKeys[`uncatalogue:${props.tweet.id}`]}
                            onClick={() => void props.onUncatalogue(props.tweet.id)}
                        />
                        <Show when={props.onRemoveFollowUp}>
                            <ActionButton
                                label={
                                    props.pendingKeys[`remove:${props.tweet.id}`]
                                        ? "updating"
                                        : "remove follow-up"
                                }
                                tone="danger"
                                disabled={props.pendingKeys[`remove:${props.tweet.id}`]}
                                onClick={() =>
                                    void props.onRemoveFollowUp?.(props.tweet.id)
                                }
                            />
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    );
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
    const [isAdminMode] = createSignal(readAdminFlag());
    const [tweets, setTweets] = createSignal<CatalogueTweet[]>([]);
    const [marks, setMarks] = createSignal<Record<string, Marks>>({});
    const [syncStatus, setSyncStatus] = createSignal("idle");
    const [syncError, setSyncError] = createSignal<string | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(null);
    const [bootstrapComplete, setBootstrapComplete] = createSignal(false);
    const [searchValue, setSearchValue] = createSignal("");
    const [debouncedSearchValue, setDebouncedSearchValue] = createSignal("");
    createEffect(() => {
        const value = searchValue();
        const timeoutId = setTimeout(() => {
            setDebouncedSearchValue(value);
        }, 200);
        onCleanup(() => clearTimeout(timeoutId));
    });
    const [miniSearch] = createSignal(createSearchIndex());
    const [searchIndexState, setSearchIndexState] = createSignal<SearchIndexState>({
        ready: false,
        count: 0,
    });
    const [adminPassword, setAdminPassword] = createSignal(
        typeof window !== "undefined"
            ? window.sessionStorage.getItem(PASSWORD_STORAGE_KEY) ?? ""
            : "",
    );
    const [statusBanner, setStatusBanner] = createSignal<StatusBanner | null>(null);
    const [pendingActions, setPendingActions] = createSignal<
        Record<string, boolean>
    >({});
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
        if (typeof window === "undefined" || isAdminMode() || marksSession) {
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
        if (typeof window === "undefined") {
            return;
        }

        const trimmed = adminPassword().trim();
        if (trimmed) {
            window.sessionStorage.setItem(PASSWORD_STORAGE_KEY, trimmed);
            return;
        }

        window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
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
                if (!nextIndex.has(tweetId)) {
                    nextIndex.add(tweet);
                } else if (
                    !previous ||
                    previous.searchText !== tweet.searchText ||
                    previous.updatedAt !== tweet.updatedAt
                ) {
                    nextIndex.replace(tweet);
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
        const filter = debouncedSearchValue().trim();
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

    const allTags = createMemo(() => {
        const set = new Set<string>();
        for (const tweet of tweets()) {
            tweet.matchedTags?.forEach((tag) => {
                if (tag) set.add(tag);
            });
            tweet.inferredFandoms?.forEach((tag) => {
                if (tag) set.add(tag);
            });
            if (tweet.inferredBoothId) set.add(tweet.inferredBoothId);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    });

    const [searchFocused, setSearchFocused] = createSignal(false);

    const tagSuggestions = createMemo(() => {
        if (!searchFocused()) return [];
        const tokens = searchValue().split(/\s+/);
        const lastToken = (tokens[tokens.length - 1] ?? "").toLowerCase();
        if (!lastToken) return [];
        const startsWith: string[] = [];
        const contains: string[] = [];
        for (const tag of allTags()) {
            const lower = tag.toLowerCase();
            if (lower === lastToken) continue;
            if (lower.startsWith(lastToken)) {
                startsWith.push(tag);
            } else if (lower.includes(lastToken)) {
                contains.push(tag);
            }
            if (startsWith.length + contains.length >= 32) break;
        }
        return [...startsWith, ...contains].slice(0, 8);
    });

    const applyTagSuggestion = (tag: string) => {
        const tokens = searchValue().split(/\s+/);
        if (tokens.length === 0) {
            setSearchValue(`${tag} `);
            return;
        }
        tokens[tokens.length - 1] = tag;
        setSearchValue(`${tokens.join(" ")} `);
    };

    const setEvent = (nextEventId: string) => {
        setEventId(nextEventId);
        const url = new URL(window.location.href);
        url.searchParams.set("event", nextEventId);
        if (isAdminMode()) {
            url.searchParams.set("admin", "1");
        }
        window.history.replaceState({}, "", url);
    };

    const setPending = (key: string, value: boolean) => {
        setPendingActions((current) => {
            if (value) {
                return {
                    ...current,
                    [key]: true,
                };
            }

            const next = { ...current };
            delete next[key];
            return next;
        });
    };

    const confirmAction = (message: string) => {
        if (typeof window === "undefined") {
            return false;
        }

        return window.confirm(message);
    };

    const apiHost = () =>
        typeof window !== "undefined" ? getApiHost(window.location.href) : "";

    const runAdminAction = async (
        key: string,
        successMessage: string,
        action: () => Promise<void>,
    ) => {
        const password = adminPassword().trim();
        if (!password) {
            setStatusBanner({
                tone: "error",
                message: "Enter the admin password before running edits.",
            });
            return;
        }

        setPending(key, true);
        try {
            await action();
            await tweetSession?.syncOnce();
            setStatusBanner({
                tone: "success",
                message: successMessage,
            });
        } catch (error) {
            setStatusBanner({
                tone: "error",
                message:
                    error instanceof Error ? error.message : "admin action failed",
            });
        } finally {
            setPending(key, false);
        }
    };

    const saveFandoms = async (tweetId: string, value: string) => {
        await runAdminAction(
            `fandom:${tweetId}`,
            `Saved fandoms for tweet ${tweetId}.`,
            async () => {
                await updateTweetMetadata({
                    apiHost: apiHost(),
                    password: adminPassword().trim(),
                    tweetId,
                    inferredFandoms: parseTagInput(value),
                });
            },
        );
    };

    const saveTags = async (tweetId: string, value: string) => {
        await runAdminAction(
            `tags:${tweetId}`,
            `Saved tags for tweet ${tweetId}.`,
            async () => {
                await updateTweetMetadata({
                    apiHost: apiHost(),
                    password: adminPassword().trim(),
                    tweetId,
                    matchedTags: parseTagInput(value),
                });
            },
        );
    };

    const makeRoot = async (thread: CatalogueTweetThread, tweetId: string) => {
        if (
            !confirmAction(
                `Make ${tweetId} the root tweet for thread ${thread.groupId}? Remaining tweets stay in their current visible order.`,
            )
        ) {
            return;
        }

        await runAdminAction(
            `reroot:${tweetId}`,
            `Thread ${thread.groupId} rerooted to ${tweetId}.`,
            async () => {
                await rerootThread({
                    apiHost: apiHost(),
                    password: adminPassword().trim(),
                    rootTweetId: thread.groupId,
                    newRootTweetId: tweetId,
                });
            },
        );
    };

    const uncatalogue = async (tweetId: string) => {
        if (
            !confirmAction(
                `Uncatalogue tweet ${tweetId}? It will disappear from the catalogue after the next sync.`,
            )
        ) {
            return;
        }

        await runAdminAction(
            `uncatalogue:${tweetId}`,
            `Tweet ${tweetId} uncatalogued.`,
            async () => {
                await uncatalogueTweet({
                    apiHost: apiHost(),
                    password: adminPassword().trim(),
                    tweetId,
                });
            },
        );
    };

    const removeFollowUp = async (tweetId: string) => {
        if (
            !confirmAction(
                `Remove follow-up ${tweetId} from the thread? This also uncatalogues the tweet.`,
            )
        ) {
            return;
        }

        await runAdminAction(
            `remove:${tweetId}`,
            `Follow-up ${tweetId} removed from the catalogue.`,
            async () => {
                await removeFollowUpTweet({
                    apiHost: apiHost(),
                    password: adminPassword().trim(),
                    tweetId,
                });
            },
        );
    };

    return (
        <Show
            when={isAdminMode()}
            fallback={
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
                                {(message) => (
                                    <div class="text-red-600">{message()}</div>
                                )}
                            </Show>
                        </div>

                        <div class="relative w-full sm:max-w-sm">
                            <input
                                type="text"
                                placeholder="Search tweets"
                                value={searchValue()}
                                onInput={(event) =>
                                    setSearchValue(event.currentTarget.value)
                                }
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                                class="w-full rounded border p-2"
                            />
                            <Show when={tagSuggestions().length > 0}>
                                <div class="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded border border-stone-200 bg-white shadow-lg">
                                    <For each={tagSuggestions()}>
                                        {(tag) => (
                                            <button
                                                type="button"
                                                class="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
                                                onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    applyTagSuggestion(tag);
                                                }}
                                            >
                                                {tag}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
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
            }
        >
            <main class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.16),_transparent_35%),linear-gradient(180deg,_#fffaf2_0%,_#f5f5f4_52%,_#fafaf9_100%)] text-stone-800">
                <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                    <section class="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/80 p-6 shadow-[0_30px_120px_-60px_rgba(41,37,36,0.5)] backdrop-blur">
                        <div class="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                            <div class="space-y-4">
                                <div class="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-950">
                                    root admin
                                </div>
                                <div class="space-y-3">
                                    <h1 class="font-[Georgia,_serif] text-4xl leading-none text-stone-950 sm:text-5xl">
                                        Catalogue control room
                                    </h1>
                                    <p class="max-w-2xl text-sm leading-7 text-stone-600">
                                        Search active catalogue threads, correct the true
                                        root tweet, add manual fandoms and tags,
                                        uncatalogue bad entries, and strip replies out
                                        of follow-ups.
                                    </p>
                                </div>
                                <div class="grid gap-3 sm:grid-cols-3">
                                    <div class="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
                                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                            event
                                        </div>
                                        <div class="mt-2 font-[Georgia,_serif] text-3xl text-stone-950">
                                            {eventId()}
                                        </div>
                                    </div>
                                    <div class="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
                                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                            cached tweets
                                        </div>
                                        <div class="mt-2 font-[Georgia,_serif] text-3xl text-stone-950">
                                            {tweets().length}
                                        </div>
                                    </div>
                                    <div class="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
                                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                            visible threads
                                        </div>
                                        <div class="mt-2 font-[Georgia,_serif] text-3xl text-stone-950">
                                            {filteredThreads().length}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-4 rounded-[1.75rem] border border-stone-200 bg-stone-950 p-5 text-stone-100 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.75)]">
                                <div class="space-y-1">
                                    <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                                        credentials
                                    </div>
                                    <label class="block">
                                        <span class="mb-2 block text-xs text-stone-300">
                                            Admin password
                                        </span>
                                        <input
                                            type="password"
                                            value={adminPassword()}
                                            onInput={(event) =>
                                                setAdminPassword(
                                                    event.currentTarget.value,
                                                )
                                            }
                                            class="w-full rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-50 outline-none transition focus:border-amber-400"
                                            placeholder="Uses pec-password header"
                                        />
                                    </label>
                                </div>
                                <div class="grid gap-2 sm:grid-cols-3">
                                    <ActionButton
                                        label="cf22"
                                        tone={
                                            eventId() === "cf22"
                                                ? "primary"
                                                : "subtle"
                                        }
                                        onClick={() => setEvent("cf22")}
                                    />
                                    <ActionButton
                                        label="cf21"
                                        tone={
                                            eventId() === "cf21"
                                                ? "primary"
                                                : "subtle"
                                        }
                                        onClick={() => setEvent("cf21")}
                                    />
                                    <ActionButton
                                        label="sync now"
                                        tone="subtle"
                                        onClick={() => {
                                            void tweetSession?.syncOnce();
                                        }}
                                    />
                                </div>
                                <label class="block">
                                    <span class="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        search
                                    </span>
                                    <div class="relative">
                                        <input
                                            type="text"
                                            placeholder="Search user, text, fandom, booth, or manual tag"
                                            value={searchValue()}
                                            onInput={(event) =>
                                                setSearchValue(event.currentTarget.value)
                                            }
                                            onFocus={() => setSearchFocused(true)}
                                            onBlur={() => setSearchFocused(false)}
                                            class="w-full rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-50 outline-none transition focus:border-amber-400"
                                        />
                                        <Show when={tagSuggestions().length > 0}>
                                            <div class="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-2xl border border-stone-700 bg-stone-900 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)]">
                                                <For each={tagSuggestions()}>
                                                    {(tag) => (
                                                        <button
                                                            type="button"
                                                            class="block w-full px-4 py-2 text-left text-sm text-stone-100 hover:bg-stone-800"
                                                            onMouseDown={(event) => {
                                                                event.preventDefault();
                                                                applyTagSuggestion(tag);
                                                            }}
                                                        >
                                                            {tag}
                                                        </button>
                                                    )}
                                                </For>
                                            </div>
                                        </Show>
                                    </div>
                                </label>
                                <div class="space-y-1 text-xs text-stone-400">
                                    <div>
                                        sync: {syncStatus()}{" "}
                                        {bootstrapComplete()
                                            ? "(ready)"
                                            : "(bootstrapping)"}
                                    </div>
                                    <div>search indexed: {searchIndexState().count}</div>
                                    <Show when={lastSyncedAt()}>
                                        {(value) => (
                                            <div>
                                                last sync:{" "}
                                                {new Date(value()).toLocaleString()}
                                            </div>
                                        )}
                                    </Show>
                                    <Show when={syncError()}>
                                        {(message) => (
                                            <div class="text-rose-300">{message()}</div>
                                        )}
                                    </Show>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div class="mt-4 space-y-4">
                        <div class="rounded-[1.5rem] border border-stone-200 bg-white/75 px-4 py-3 text-sm text-stone-600 shadow-[0_20px_60px_-50px_rgba(41,37,36,0.4)] backdrop-blur">
                            Admin mode is only shown when `?admin=1` is present in the
                            URL.
                        </div>

                        <Show when={statusBanner()}>
                            {(banner) => (
                                <div
                                    class={`rounded-[1.5rem] border px-4 py-3 text-sm shadow-[0_20px_60px_-50px_rgba(41,37,36,0.35)] ${statusClass(
                                        banner().tone,
                                    )}`}
                                >
                                    {banner().message}
                                </div>
                            )}
                        </Show>
                    </div>

                    <section class="mt-6 space-y-6">
                        <Show
                            when={filteredThreads().length > 0}
                            fallback={
                                <div class="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center text-sm text-stone-500">
                                    {tweets().length === 0
                                        ? "No catalogue tweets are cached yet."
                                        : "No threads match the current search."}
                                </div>
                            }
                        >
                            <For each={filteredThreads()}>
                                {(thread) => (
                                    <article class="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/78 shadow-[0_32px_120px_-70px_rgba(41,37,36,0.55)] backdrop-blur">
                                        <div class="border-b border-stone-200/80 bg-[linear-gradient(135deg,_rgba(245,158,11,0.08),_rgba(255,255,255,0.82))] px-5 py-4">
                                            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                                <div class="space-y-1">
                                                    <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                                                        thread {thread.groupId}
                                                    </div>
                                                    <div class="font-[Georgia,_serif] text-2xl text-stone-950">
                                                        @{thread.root.user}
                                                    </div>
                                                </div>
                                                <div class="flex flex-wrap gap-2 text-xs text-stone-500">
                                                    <span class="rounded-full border border-stone-200 bg-white px-3 py-1">
                                                        {thread.replies.length} follow-up
                                                        {thread.replies.length === 1
                                                            ? ""
                                                            : "s"}
                                                    </span>
                                                    <Show
                                                        when={thread.root.inferredBoothId}
                                                    >
                                                        {(boothId) => (
                                                            <span class="rounded-full border border-stone-200 bg-white px-3 py-1">
                                                                booth {boothId()}
                                                            </span>
                                                        )}
                                                    </Show>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                                            <AdminTweetRow
                                                tweet={thread.root}
                                                label="root tweet"
                                                pendingKeys={pendingActions()}
                                                onSaveFandoms={saveFandoms}
                                                onSaveTags={saveTags}
                                                onUncatalogue={uncatalogue}
                                            />

                                            <For each={thread.replies}>
                                                {(tweet) => (
                                                    <AdminTweetRow
                                                        tweet={tweet}
                                                        label={`follow-up ${tweet.threadPosition ?? ""}`}
                                                        pendingKeys={pendingActions()}
                                                        onSaveFandoms={saveFandoms}
                                                        onSaveTags={saveTags}
                                                        onMakeRoot={(tweetId) =>
                                                            makeRoot(thread, tweetId)
                                                        }
                                                        onUncatalogue={uncatalogue}
                                                        onRemoveFollowUp={
                                                            removeFollowUp
                                                        }
                                                    />
                                                )}
                                            </For>
                                        </div>
                                    </article>
                                )}
                            </For>
                        </Show>
                    </section>
                </div>
            </main>
        </Show>
    );
}
