import { createStore, type Content, type Store } from "tinybase";
import {
    createIndexedDbPersister,
    type IndexedDbPersister,
} from "tinybase/persisters/persister-indexed-db";
import type { Marks } from "@comifuro/core/types";
import { createMarksSyncProtocol } from "./sync-protocol";

const MARKS_TABLE = "marks";

export type MarksSnapshot = {
    marks: Record<string, Marks>;
};

type MarksStoreListener = (snapshot: MarksSnapshot) => void;

const defaultMarksContent = (): Content => [{}, {}];

const getMarksSnapshot = (store: Store): MarksSnapshot => {
    const table = store.getTable(MARKS_TABLE) as Record<string, { mark?: Marks }>;
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

export type MarksStoreSession = {
    store: Store;
    subscribe: (listener: MarksStoreListener) => () => void;
    setMark: (tweetId: string, mark: Marks) => void;
    clearMark: (tweetId: string) => void;
    destroy: () => Promise<void>;
};

export async function createMarksStoreSession({
    accountId,
    apiHost,
}: {
    accountId: string;
    apiHost: string;
}): Promise<MarksStoreSession> {
    const store = createStore();
    const persister: IndexedDbPersister = createIndexedDbPersister(
        store,
        `comifuro-marks-${accountId}`,
    );

    await persister.load(defaultMarksContent);
    await persister.startAutoSave();

    const sync = createMarksSyncProtocol(apiHost);
    const listeners = new Set<MarksStoreListener>();
    let destroyed = false;
    let syncPromise: Promise<void> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastKnownVersion = 0;
    let pendingMarks = new Map<string, { mark: Marks | null }>();

    const emit = () => {
        emitListeners(listeners, getMarksSnapshot(store));
    };

    store.addDidFinishTransactionListener(() => emit());

    const clearPollTimer = () => {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    };

    const scheduleSync = () => {
        clearPollTimer();
        if (destroyed) return;

        const delay =
            typeof document !== "undefined" && document.visibilityState === "visible"
                ? 30_000
                : 300_000;
        pollTimer = setTimeout(() => void syncOnce(), delay);
    };

    const syncOnce = async () => {
        if (syncPromise) return syncPromise;

        syncPromise = (async () => {
            try {
                await sync.flushPending(pendingMarks, accountId);

                const result = await sync.pull(accountId, lastKnownVersion);

                store.transaction(() => {
                    for (const m of result.marks) {
                        store.setRow(MARKS_TABLE, m.tweetId, { mark: m.mark });
                    }
                });

                lastKnownVersion = Math.max(lastKnownVersion, result.serverTime);
            } catch (error) {
                console.error("[marks] sync error", error);
            } finally {
                syncPromise = null;
                scheduleSync();
            }
        })();

        return syncPromise;
    };

    const onWindowSync = () => void syncOnce();

    if (typeof window !== "undefined") {
        window.addEventListener("focus", onWindowSync);
        window.addEventListener("online", onWindowSync);
        document.addEventListener("visibilitychange", onWindowSync);
    }

    emit();
    void syncOnce();

    return {
        store,
        subscribe(listener) {
            listeners.add(listener);
            listener(getMarksSnapshot(store));
            return () => listeners.delete(listener);
        },
        setMark(tweetId, mark) {
            store.setRow(MARKS_TABLE, tweetId, { mark });
            pendingMarks.set(tweetId, { mark });
            void syncOnce();
        },
        clearMark(tweetId) {
            store.delRow(MARKS_TABLE, tweetId);
            pendingMarks.set(tweetId, { mark: null });
            void syncOnce();
        },
        async destroy() {
            if (destroyed) return;
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
