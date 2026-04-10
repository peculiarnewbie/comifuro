import { createStore, type Content, type Store } from "tinybase";
import {
    createIndexedDbPersister,
    type IndexedDbPersister,
} from "tinybase/persisters/persister-indexed-db";
import type {
    Marks,
    TweetSyncCursor,
    TweetSyncItem,
    TweetSyncResponse,
} from "@comifuro/core/types";

const TWEETS_TABLE = "tweets";
const MARKS_TABLE = "marks";
const VALUE_SYNC_TOKEN = "syncToken";
const VALUE_CURSOR_UPDATED_AT = "cursorUpdatedAt";
const VALUE_CURSOR_ID = "cursorId";
const VALUE_LAST_SYNCED_AT = "lastSyncedAt";
const VALUE_BOOTSTRAP_COMPLETE = "bootstrapComplete";
const VALUE_SYNC_STATUS = "syncStatus";
const VALUE_SYNC_ERROR = "syncError";

export type SyncStatus = "idle" | "loading" | "syncing" | "error";

export type CatalogueTweet = Omit<TweetSyncItem, "deleted">;
export type CatalogueTweetThread = {
    groupId: string;
    root: CatalogueTweet;
    replies: CatalogueTweet[];
};

export type TweetStoreSnapshot = {
    tweets: CatalogueTweet[];
    syncToken: string | null;
    cursorUpdatedAt: number | null;
    cursorId: string | null;
    lastSyncedAt: number | null;
    bootstrapComplete: boolean;
    syncStatus: SyncStatus;
    syncError: string | null;
};

export type MarksSnapshot = {
    marks: Record<string, Marks>;
};

type TweetStoreListener = (snapshot: TweetStoreSnapshot) => void;
type MarksStoreListener = (snapshot: MarksSnapshot) => void;

const defaultTweetContent = (): Content => [
        {},
        {
            [VALUE_SYNC_TOKEN]: null,
            [VALUE_CURSOR_UPDATED_AT]: null,
            [VALUE_CURSOR_ID]: null,
            [VALUE_LAST_SYNCED_AT]: null,
            [VALUE_BOOTSTRAP_COMPLETE]: false,
            [VALUE_SYNC_STATUS]: "idle",
            [VALUE_SYNC_ERROR]: null,
        },
    ];

const defaultMarksContent = (): Content => [{}, {}];

const compareTweetIdsDesc = (left: string, right: string) => {
    if (left === right) {
        return 0;
    }

    return BigInt(left) > BigInt(right) ? -1 : 1;
};

const getValue = <T>(store: Store, valueId: string, fallback: T) => {
    const value = store.getValue(valueId);
    return value == null ? fallback : (value as T);
};

const compareThreadPositionsAsc = (left: CatalogueTweet, right: CatalogueTweet) => {
    const leftPosition = left.threadPosition ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.threadPosition ?? Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
    }

    return compareTweetIdsDesc(right.id, left.id);
};

export function groupTweetsIntoThreads(
    tweets: CatalogueTweet[],
): CatalogueTweetThread[] {
    const roots = new Map<string, CatalogueTweetThread>();
    const pendingReplies = new Map<string, CatalogueTweet[]>();

    for (const tweet of tweets) {
        if (!tweet.rootTweetId) {
            roots.set(tweet.id, {
                groupId: tweet.id,
                root: tweet,
                replies: [],
            });
            continue;
        }

        const current = pendingReplies.get(tweet.rootTweetId) ?? [];
        current.push(tweet);
        pendingReplies.set(tweet.rootTweetId, current);
    }

    for (const [rootTweetId, replies] of pendingReplies.entries()) {
        const thread = roots.get(rootTweetId);
        if (!thread) {
            continue;
        }

        thread.replies = replies.sort(compareThreadPositionsAsc);
    }

    return Array.from(roots.values()).sort((left, right) =>
        compareTweetIdsDesc(left.groupId, right.groupId),
    );
}

const getTweetSnapshot = (store: Store): TweetStoreSnapshot => {
    const table = store.getTable(TWEETS_TABLE) as Record<
        string,
        Omit<CatalogueTweet, "id">
    >;
    const tweets = Object.entries(table ?? {})
        .map(([id, row]) => ({
            id,
            eventId: row.eventId,
            user: row.user,
            displayName: row.displayName ?? null,
            timestamp: Number(row.timestamp),
            text: row.text,
            tweetUrl: row.tweetUrl,
            imageMask: Number(row.imageMask),
            classification: row.classification,
            inferredFandoms: Array.isArray(row.inferredFandoms)
                ? row.inferredFandoms
                : [],
            inferredBoothId: row.inferredBoothId ?? null,
            rootTweetId: row.rootTweetId ?? null,
            parentTweetId: row.parentTweetId ?? null,
            threadPosition:
                row.threadPosition == null ? null : Number(row.threadPosition),
            updatedAt: Number(row.updatedAt),
            images: Array.isArray(row.images) ? row.images : [],
        }))
        .sort((left, right) => compareTweetIdsDesc(left.id, right.id));

    return {
        tweets,
        syncToken: getValue<string | null>(store, VALUE_SYNC_TOKEN, null),
        cursorUpdatedAt: getValue<number | null>(
            store,
            VALUE_CURSOR_UPDATED_AT,
            null,
        ),
        cursorId: getValue<string | null>(store, VALUE_CURSOR_ID, null),
        lastSyncedAt: getValue<number | null>(store, VALUE_LAST_SYNCED_AT, null),
        bootstrapComplete: getValue<boolean>(
            store,
            VALUE_BOOTSTRAP_COMPLETE,
            false,
        ),
        syncStatus: getValue<SyncStatus>(store, VALUE_SYNC_STATUS, "idle"),
        syncError: getValue<string | null>(store, VALUE_SYNC_ERROR, null),
    };
};

const getMarksSnapshot = (store: Store): MarksSnapshot => {
    const table = store.getTable(MARKS_TABLE) as Record<
        string,
        { mark?: Marks }
    >;

    return {
        marks: Object.fromEntries(
            Object.entries(table ?? {})
                .filter(([, row]) => row?.mark)
                .map(([tweetId, row]) => [tweetId, row.mark as Marks]),
        ),
    };
};

const emitListeners = <T>(listeners: Set<(snapshot: T) => void>, snapshot: T) => {
    for (const listener of listeners) {
        listener(snapshot);
    }
};

const ensureTweetDefaults = (store: Store) => {
    const [, defaultValues] = defaultTweetContent();
    for (const [key, value] of Object.entries(defaultValues)) {
        if (store.getValue(key) === undefined) {
            store.setValue(key, value);
        }
    }
};

const idle = () =>
    new Promise<void>((resolve) => {
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            window.requestIdleCallback(() => resolve());
            return;
        }

        setTimeout(resolve, 0);
    });

export const getApiHost = (url: string) => {
    const override = import.meta.env.VITE_API_BASE_URL?.trim();
    if (override) {
        return override.replace(/\/$/, "");
    }

    const origin = new URL(url).origin;
    if (origin === "http://localhost:3000" || origin === "http://localhost:5173") {
        return "http://localhost:8787/api";
    }

    return `${origin}/api`;
};

export type TweetStoreSession = {
    store: Store;
    subscribe: (listener: TweetStoreListener) => () => void;
    start: () => Promise<void>;
    syncOnce: () => Promise<void>;
    destroy: () => Promise<void>;
};

export async function createTweetStoreSession({
    eventId,
    apiHost,
}: {
    eventId: string;
    apiHost: string;
}): Promise<TweetStoreSession> {
    const store = createStore();
    const persister = createIndexedDbPersister(
        store,
        `comifuro-tweets-${eventId}`,
    );

    await persister.load(defaultTweetContent);
    ensureTweetDefaults(store);
    await persister.startAutoSave();

    const listeners = new Set<TweetStoreListener>();
    let syncPromise: Promise<void> | null = null;
    let destroyed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = () => {
        emitListeners(listeners, getTweetSnapshot(store));
    };

    store.addDidFinishTransactionListener(() => {
        emit();
    });

    const clearPollTimer = () => {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    };

    const getCursor = (): TweetSyncCursor | undefined => {
        const updatedAt = getValue<number | null>(
            store,
            VALUE_CURSOR_UPDATED_AT,
            null,
        );
        const id = getValue<string | null>(store, VALUE_CURSOR_ID, null);

        return updatedAt != null && id
            ? {
                  updatedAt,
                  id,
              }
            : undefined;
    };

    const resetForToken = (syncToken: string) => {
        store.transaction(() => {
            store.delTable(TWEETS_TABLE);
            store
                .setValue(VALUE_SYNC_TOKEN, syncToken)
                .setValue(VALUE_CURSOR_UPDATED_AT, null)
                .setValue(VALUE_CURSOR_ID, null)
                .setValue(VALUE_BOOTSTRAP_COMPLETE, false)
                .setValue(VALUE_SYNC_ERROR, null);
        });
    };

    const applyItems = (items: TweetSyncItem[], response: TweetSyncResponse) => {
        store.transaction(() => {
            for (const item of items) {
                if (item.deleted) {
                    store.delRow(TWEETS_TABLE, item.id);
                    continue;
                }

                store.setRow(TWEETS_TABLE, item.id, {
                    eventId: item.eventId,
                    user: item.user,
                    displayName: item.displayName,
                    timestamp: item.timestamp,
                    text: item.text,
                    tweetUrl: item.tweetUrl,
                    imageMask: item.imageMask,
                    classification: item.classification,
                    inferredFandoms: item.inferredFandoms,
                    inferredBoothId: item.inferredBoothId,
                    rootTweetId: item.rootTweetId,
                    parentTweetId: item.parentTweetId,
                    threadPosition: item.threadPosition,
                    updatedAt: item.updatedAt,
                    images: item.images,
                });
            }

            store
                .setValue(VALUE_SYNC_TOKEN, response.syncToken)
                .setValue(
                    VALUE_CURSOR_UPDATED_AT,
                    response.nextCursor?.updatedAt ?? getCursor()?.updatedAt ?? null,
                )
                .setValue(
                    VALUE_CURSOR_ID,
                    response.nextCursor?.id ?? getCursor()?.id ?? null,
                )
                .setValue(VALUE_LAST_SYNCED_AT, response.serverTime)
                .setValue(VALUE_SYNC_ERROR, null);

            if (!response.hasMore) {
                store.setValue(VALUE_BOOTSTRAP_COMPLETE, true);
            }
        });
    };

    const fetchSyncPage = async (cursor?: TweetSyncCursor) => {
        const params = new URLSearchParams();
        params.set("eventId", eventId);
        params.set("limit", "500");

        if (cursor) {
            params.set("cursorUpdatedAt", `${cursor.updatedAt}`);
            params.set("cursorId", cursor.id);
        }

        const response = await fetch(`${apiHost}/tweets/sync?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`sync failed with status ${response.status}`);
        }

        return (await response.json()) as TweetSyncResponse;
    };

    const scheduleSync = () => {
        clearPollTimer();
        if (destroyed) {
            return;
        }

        const delay =
            typeof document !== "undefined" && document.visibilityState === "visible"
                ? 30_000
                : 300_000;
        pollTimer = setTimeout(() => {
            void syncOnce();
        }, delay);
    };

    const syncOnce = async () => {
        if (syncPromise) {
            return syncPromise;
        }

        syncPromise = (async () => {
            try {
                store.setValue(
                    VALUE_SYNC_STATUS,
                    getValue<boolean>(store, VALUE_BOOTSTRAP_COMPLETE, false)
                        ? "syncing"
                        : "loading",
                );

                let continuePaging = true;
                while (continuePaging && !destroyed) {
                    const response = await fetchSyncPage(getCursor());
                    const existingToken = getValue<string | null>(
                        store,
                        VALUE_SYNC_TOKEN,
                        null,
                    );

                    if (
                        existingToken !== null &&
                        existingToken !== response.syncToken
                    ) {
                        resetForToken(response.syncToken);
                        continue;
                    }

                    if (existingToken === null) {
                        store.setValue(VALUE_SYNC_TOKEN, response.syncToken);
                    }

                    applyItems(response.items, response);
                    continuePaging = response.hasMore;

                    if (continuePaging) {
                        await idle();
                    }
                }

                store.setValue(VALUE_SYNC_STATUS, "idle");
            } catch (error) {
                store
                    .setValue(VALUE_SYNC_STATUS, "error")
                    .setValue(
                        VALUE_SYNC_ERROR,
                        error instanceof Error ? error.message : "sync failed",
                    );
            } finally {
                syncPromise = null;
                scheduleSync();
            }
        })();

        return syncPromise;
    };

    const onWindowSync = () => {
        void syncOnce();
    };

    const start = async () => {
        if (typeof window !== "undefined") {
            window.addEventListener("focus", onWindowSync);
            window.addEventListener("online", onWindowSync);
            document.addEventListener("visibilitychange", onWindowSync);
        }

        emit();
        await syncOnce();
    };

    return {
        store,
        subscribe(listener) {
            listeners.add(listener);
            listener(getTweetSnapshot(store));

            return () => {
                listeners.delete(listener);
            };
        },
        start,
        syncOnce,
        async destroy() {
            if (destroyed) {
                return;
            }

            destroyed = true;
            clearPollTimer();

            if (typeof window !== "undefined") {
                window.removeEventListener("focus", onWindowSync);
                window.removeEventListener("online", onWindowSync);
                document.removeEventListener("visibilitychange", onWindowSync);
            }

            await persister.destroy();
        },
    };
}

export type MarksStoreSession = {
    store: Store;
    subscribe: (listener: MarksStoreListener) => () => void;
    setMark: (tweetId: string, mark: Marks) => void;
    clearMark: (tweetId: string) => void;
    destroy: () => Promise<void>;
};

export async function createMarksStoreSession(): Promise<MarksStoreSession> {
    const store = createStore();
    const persister: IndexedDbPersister = createIndexedDbPersister(
        store,
        "comifuro-user",
    );

    await persister.load(defaultMarksContent);
    await persister.startAutoSave();

    const listeners = new Set<MarksStoreListener>();
    store.addDidFinishTransactionListener(() => {
        emitListeners(listeners, getMarksSnapshot(store));
    });

    return {
        store,
        subscribe(listener) {
            listeners.add(listener);
            listener(getMarksSnapshot(store));

            return () => {
                listeners.delete(listener);
            };
        },
        setMark(tweetId, mark) {
            store.setRow(MARKS_TABLE, tweetId, { mark });
        },
        clearMark(tweetId) {
            store.delRow(MARKS_TABLE, tweetId);
        },
        async destroy() {
            await persister.destroy();
        },
    };
}
