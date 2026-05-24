import * as Schema from "effect/Schema";
import { createStore, type Content, type Store } from "tinybase";
import {
    createIndexedDbPersister,
} from "tinybase/persisters/persister-indexed-db";
import type {
    TweetSyncItem,
} from "@comifuro/core/types";
import {
    TweetSyncItemSchema,
} from "@comifuro/core/schemas";
import {
    createTweetSyncProtocol,
    type TweetSyncProtocol,
} from "./sync-protocol";
import {
    parseTagInput,
    updateTweetMetadata,
    rerootThread,
    uncatalogueTweet,
    removeFollowUpTweet,
} from "./admin-api";

const TWEETS_TABLE = "tweets";
const VALUE_SYNC_STATUS = "syncStatus";
const VALUE_SYNC_ERROR = "syncError";
const VALUE_LAST_SYNCED_AT = "lastSyncedAt";
const VALUE_BOOTSTRAP_COMPLETE = "bootstrapComplete";

export type SyncStatus = "idle" | "loading" | "syncing" | "error";

export type SearchIndexState = {
    ready: boolean;
    count: number;
};

const CatalogueTweetSchema = Schema.Struct({
    ...TweetSyncItemSchema.fields,
});

export type CatalogueTweet = Schema.Schema.Type<typeof CatalogueTweetSchema>;

export type CatalogueTweetThread = {
    groupId: string;
    root: CatalogueTweet;
    replies: CatalogueTweet[];
};

export type TweetStoreSnapshot = {
    tweets: CatalogueTweet[];
    lastSyncedAt: number | null;
    bootstrapComplete: boolean;
    syncStatus: SyncStatus;
    syncError: string | null;
};

type TweetStoreListener = (snapshot: TweetStoreSnapshot) => void;

const defaultTweetContent = (): Content => [
    {},
    {
        [VALUE_SYNC_STATUS]: "idle",
        [VALUE_SYNC_ERROR]: null,
        [VALUE_LAST_SYNCED_AT]: null,
        [VALUE_BOOTSTRAP_COMPLETE]: false,
    },
];

const compareTweetIdsDesc = (left: string, right: string) => {
    if (left === right) return 0;
    return BigInt(left) > BigInt(right) ? -1 : 1;
};

const compareThreadPositionsAsc = (
    left: CatalogueTweet,
    right: CatalogueTweet,
) => {
    const leftPosition = left.threadPosition ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.threadPosition ?? Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
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
        if (!thread) continue;
        thread.replies = replies.sort(compareThreadPositionsAsc);
    }

    return Array.from(roots.values()).sort((left, right) =>
        compareTweetIdsDesc(left.groupId, right.groupId),
    );
}

const getValue = <T>(store: Store, valueId: string, fallback: T) => {
    const value = store.getValue(valueId);
    return value == null ? fallback : (value as T);
};

const idle = () =>
    new Promise<void>((resolve) => {
        if (
            typeof window !== "undefined" &&
            "requestIdleCallback" in window
        ) {
            window.requestIdleCallback(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });

export const getApiHost = (url: string) => {
    const override = import.meta.env.VITE_API_BASE_URL?.trim();
    if (override) return override.replace(/\/$/, "");
    const origin = new URL(url).origin;
    if (
        origin === "http://localhost:3000" ||
        origin === "http://localhost:5173"
    ) {
        return "http://localhost:8787/api";
    }
    return `${origin}/api`;
};

export type AdminAuth = {
    password: string;
    accountId: string;
};

export type AdminActions = {
    saveFandoms: (
        tweetId: string,
        value: string,
        auth: AdminAuth,
    ) => Promise<void>;
    saveTags: (
        tweetId: string,
        value: string,
        auth: AdminAuth,
    ) => Promise<void>;
    reroot: (
        groupId: string,
        tweetId: string,
        auth: AdminAuth,
    ) => Promise<void>;
    uncatalogue: (tweetId: string, auth: AdminAuth) => Promise<void>;
    removeFollowUp: (
        tweetId: string,
        auth: AdminAuth,
    ) => Promise<void>;
};

export type TweetStoreSession = {
    store: Store;
    subscribe: (listener: TweetStoreListener) => () => void;
    start: () => Promise<void>;
    syncOnce: () => Promise<void>;
    destroy: () => Promise<void>;
    admin: AdminActions;
    syncProtocol: TweetSyncProtocol;
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
    const [, defaultValues] = defaultTweetContent();
    for (const [key, value] of Object.entries(defaultValues)) {
        if (store.getValue(key) === undefined) {
            store.setValue(key, value);
        }
    }
    await persister.startAutoSave();

    const sync = createTweetSyncProtocol(apiHost);
    const listeners = new Set<TweetStoreListener>();
    let syncPromise: Promise<void> | null = null;
    let destroyed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const getSnapshot = (): TweetStoreSnapshot => {
        const table = store.getTable(TWEETS_TABLE) as Record<
            string,
            Record<string, unknown>
        >;
        const tweets = Object.entries(table ?? {})
            .map(([id, row]) =>
                Schema.decodeUnknownSync(CatalogueTweetSchema)({ id, ...row }),
            )
            .sort((left, right) => compareTweetIdsDesc(left.id, right.id));

        return {
            tweets,
            lastSyncedAt: getValue<number | null>(
                store,
                VALUE_LAST_SYNCED_AT,
                null,
            ),
            bootstrapComplete: getValue<boolean>(
                store,
                VALUE_BOOTSTRAP_COMPLETE,
                false,
            ),
            syncStatus: getValue<SyncStatus>(store, VALUE_SYNC_STATUS, "idle"),
            syncError: getValue<string | null>(store, VALUE_SYNC_ERROR, null),
        };
    };

    const emit = () => {
        const snapshot = getSnapshot();
        for (const listener of listeners) {
            listener(snapshot);
        }
    };

    store.addDidFinishTransactionListener(() => emit());

    const clearPollTimer = () => {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    };

    const applyItems = (items: readonly TweetSyncItem[]) => {
        store.transaction(() => {
            for (const item of items) {
                if (item.deleted) {
                    store.delRow(TWEETS_TABLE, item.id);
                    continue;
                }
                store.setRow(TWEETS_TABLE, item.id, item as CatalogueTweet);
            }
        });
    };

    const setStatus = (status: SyncStatus) =>
        store.setValue(VALUE_SYNC_STATUS, status);
    const setError = (error: string | null) =>
        store.setValue(VALUE_SYNC_ERROR, error);
    const setBootstrapComplete = (v: boolean) =>
        store.setValue(VALUE_BOOTSTRAP_COMPLETE, v);
    const setLastSyncedAt = (t: number) =>
        store.setValue(VALUE_LAST_SYNCED_AT, t);

    const syncOnce = async () => {
        if (syncPromise) return syncPromise;

        syncPromise = (async () => {
            try {
                const bootstrapped = getValue<boolean>(
                    store,
                    VALUE_BOOTSTRAP_COMPLETE,
                    false,
                );
                setStatus(bootstrapped ? "syncing" : "loading");

                let continuePaging = true;
                while (continuePaging && !destroyed) {
                    const page = await sync.syncOnce(eventId);

                    if (page.tokenChanged) {
                        store.transaction(() => {
                            store.delTable(TWEETS_TABLE);
                            setBootstrapComplete(false);
                            setError(null);
                        });
                        continue;
                    }

                    applyItems(page.items);
                    setLastSyncedAt(page.serverTime);

                    if (!page.hasMore) {
                        setBootstrapComplete(true);
                    }

                    continuePaging = page.hasMore;

                    if (continuePaging) {
                        await idle();
                    }
                }

                setStatus("idle");
            } catch (error) {
                setStatus("error");
                setError(
                    error instanceof Error
                        ? error.message
                        : "sync failed",
                );
            } finally {
                syncPromise = null;
                scheduleSync();
            }
        })();

        return syncPromise;
    };

    const scheduleSync = () => {
        clearPollTimer();
        if (destroyed) return;

        const delay =
            typeof document !== "undefined" &&
            document.visibilityState === "visible"
                ? 30_000
                : 300_000;
        pollTimer = setTimeout(() => void syncOnce(), delay);
    };

    const onWindowSync = () => void syncOnce();

    const start = async () => {
        if (typeof window !== "undefined") {
            window.addEventListener("focus", onWindowSync);
            window.addEventListener("online", onWindowSync);
            document.addEventListener("visibilitychange", onWindowSync);
        }
        emit();
        await syncOnce();
    };

    const admin: AdminActions = {
        async saveFandoms(tweetId, value, auth) {
            await updateTweetMetadata({
                apiHost,
                password: auth.password,
                accountId: auth.accountId,
                tweetId,
                inferredFandoms: parseTagInput(value),
            });
            await syncOnce();
        },
        async saveTags(tweetId, value, auth) {
            await updateTweetMetadata({
                apiHost,
                password: auth.password,
                accountId: auth.accountId,
                tweetId,
                matchedTags: parseTagInput(value),
            });
            await syncOnce();
        },
        async reroot(groupId, tweetId, auth) {
            await rerootThread({
                apiHost,
                password: auth.password,
                accountId: auth.accountId,
                rootTweetId: groupId,
                newRootTweetId: tweetId,
            });
            await syncOnce();
        },
        async uncatalogue(tweetId, auth) {
            await uncatalogueTweet({
                apiHost,
                password: auth.password,
                accountId: auth.accountId,
                tweetId,
            });
            await syncOnce();
        },
        async removeFollowUp(tweetId, auth) {
            await removeFollowUpTweet({
                apiHost,
                password: auth.password,
                accountId: auth.accountId,
                tweetId,
            });
            await syncOnce();
        },
    };

    return {
        store,
        subscribe(listener) {
            listeners.add(listener);
            listener(getSnapshot());
            return () => listeners.delete(listener);
        },
        start,
        syncOnce,
        admin,
        syncProtocol: sync,
        async destroy() {
            if (destroyed) return;
            destroyed = true;
            clearPollTimer();

            if (typeof window !== "undefined") {
                window.removeEventListener("focus", onWindowSync);
                window.removeEventListener("online", onWindowSync);
                document.removeEventListener(
                    "visibilitychange",
                    onWindowSync,
                );
            }

            await persister.destroy();
        },
    };
}
