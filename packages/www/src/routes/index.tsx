import { createFileRoute } from "@tanstack/solid-router";
import MiniSearch from "minisearch";
import {
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
} from "solid-js";
import type { Marks } from "@comifuro/core/types";
import {
    createMarksStoreSession,
    createTweetStoreSession,
    getApiHost,
    groupTweetsIntoThreads,
    type CatalogueTweet,
    type CatalogueTweetThread,
    type MarksStoreSession,
    type TweetStoreSession,
    type SearchIndexState,
} from "../lib/catalogue-store";
import {
    parseTagInput,
    removeFollowUpTweet,
    rerootThread,
    uncatalogueTweet,
    updateTweetMetadata,
} from "../lib/admin-api";
import { createTweetThreadSearchText } from "../lib/tweet-search";
import { getOrCreateAccountId } from "../lib/account";
import CataloguePage from "../components/catalogue/CataloguePage";
import AdminPanel from "../components/admin/AdminPanel";

const PASSWORD_STORAGE_KEY = "comifuro-admin-password";

type SearchDocument = {
    id: string;
    searchText: string;
    updatedAt: number;
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

export function AppRouteComponent() {
    const [eventId, setEventId] = createSignal(
        typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
                  .get("event")
                  ?.trim()
                  .toLowerCase() || "cf22"
            : "cf22",
    );
    const isAdminMode = readAdminFlag();
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
    const miniSearch = createSearchIndex();
    const [searchIndexState, setSearchIndexState] = createSignal<SearchIndexState>({
        ready: false,
        count: 0,
    });
    const [adminPassword, setAdminPassword] = createSignal(
        typeof window !== "undefined"
            ? window.sessionStorage.getItem(PASSWORD_STORAGE_KEY) ?? ""
            : "",
    );
    const accountId = getOrCreateAccountId();
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
        if (typeof window === "undefined" || isAdminMode || marksSession) {
            return;
        }

        let disposed = false;
        let unsubscribe = () => {};

        (async () => {
            const accountId = getOrCreateAccountId();
            const nextSession = await createMarksStoreSession({
                accountId,
                apiHost: getApiHost(window.location.href),
            });
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
        const nextIndex = miniSearch;
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
        return miniSearch
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
        if (isAdminMode) {
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
                    accountId,
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
                    accountId,
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
                    accountId,
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
                    accountId,
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
                    accountId,
                    tweetId,
                });
            },
        );
    };

    return (
        <Show
            when={isAdminMode}
            fallback={
                <CataloguePage
                    eventId={eventId()}
                    setEvent={setEvent}
                    tweetCount={tweets().length}
                    syncStatus={syncStatus()}
                    syncError={syncError()}
                    lastSyncedAt={lastSyncedAt()}
                    bootstrapComplete={bootstrapComplete()}
                    searchValue={searchValue()}
                    setSearchValue={setSearchValue}
                    searchFocused={searchFocused()}
                    setSearchFocused={setSearchFocused}
                    tagSuggestions={tagSuggestions()}
                    applyTagSuggestion={applyTagSuggestion}
                    filteredThreads={filteredThreads()}
                    marks={marks()}
                    marksSession={marksSession}
                    tweetSession={tweetSession}
                    searchIndexState={searchIndexState()}
                />
            }
        >
            <AdminPanel
                eventId={eventId()}
                setEvent={setEvent}
                tweetCount={tweets().length}
                syncStatus={syncStatus()}
                syncError={syncError()}
                lastSyncedAt={lastSyncedAt()}
                bootstrapComplete={bootstrapComplete()}
                searchValue={searchValue()}
                setSearchValue={setSearchValue}
                searchFocused={searchFocused()}
                setSearchFocused={setSearchFocused}
                tagSuggestions={tagSuggestions()}
                applyTagSuggestion={applyTagSuggestion}
                filteredThreads={filteredThreads()}
                adminPassword={adminPassword()}
                setAdminPassword={setAdminPassword}
                statusBanner={statusBanner()}
                pendingActions={pendingActions()}
                saveFandoms={saveFandoms}
                saveTags={saveTags}
                makeRoot={makeRoot}
                uncatalogue={uncatalogue}
                removeFollowUp={removeFollowUp}
                tweetSession={tweetSession}
                searchIndexState={searchIndexState()}
            />
        </Show>
    );
}

export const Route = createFileRoute("/")({
    component: AppRouteComponent,
});
