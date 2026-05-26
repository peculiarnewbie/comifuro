import * as Schema from "effect/Schema";
import {
    TweetSyncResponse as TweetSyncResponseSchema,
    MarksResponse as MarksResponseSchema,
} from "@comifuro/core/schemas";
import type { TweetSyncItem, Marks } from "@comifuro/core/types";

export type TweetSyncPage = {
    items: TweetSyncItem[];
    nextCursor: { updatedAt: number; id: string } | null;
    hasMore: boolean;
    serverTime: number;
    tokenChanged: boolean;
};

export type TweetSyncProtocol = {
    syncOnce(eventId: string): Promise<TweetSyncPage>;
    reset(): void;
};

export function createTweetSyncProtocol(apiHost: string): TweetSyncProtocol {
    let cursor: { updatedAt: number; id: string } | undefined;
    let syncToken: string | null = null;

    const fetchSyncPage = async (eventId: string) => {
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

        return Schema.decodeUnknownSync(TweetSyncResponseSchema)(await response.json());
    };

    const syncOnce = async (eventId: string): Promise<TweetSyncPage> => {
        const raw = await fetchSyncPage(eventId);

        if (syncToken !== null && syncToken !== raw.syncToken) {
            syncToken = raw.syncToken;
            cursor = undefined;
            return {
                items: [],
                nextCursor: null,
                hasMore: true,
                serverTime: raw.serverTime,
                tokenChanged: true,
            };
        }

        syncToken ??= raw.syncToken;

        const lastItem = raw.items[raw.items.length - 1];
        const next =
            lastItem && raw.hasMore
                ? {
                      updatedAt: lastItem.updatedAt,
                      id: lastItem.id,
                  }
                : raw.nextCursor;

        if (!raw.hasMore) {
            cursor = undefined;
        } else if (next) {
            cursor = next;
        }

        return {
            items: [...raw.items],
            nextCursor: next,
            hasMore: raw.hasMore,
            serverTime: raw.serverTime,
            tokenChanged: false,
        };
    };

    const reset = () => {
        cursor = undefined;
        syncToken = null;
    };

    return { syncOnce, reset };
}

export type MarksSyncPage = {
    marks: { tweetId: string; mark: Marks }[];
};

export type MarksSyncProtocol = {
    flushPending(pending: Map<string, { mark: Marks | null }>, accountId: string): Promise<void>;
    pull(
        accountId: string,
        lastKnownVersion: number,
    ): Promise<{ marks: { tweetId: string; mark: Marks }[]; serverTime: number }>;
};

export function createMarksSyncProtocol(apiHost: string): MarksSyncProtocol {
    const flushPending = async (
        pending: Map<string, { mark: Marks | null }>,
        accountId: string,
    ) => {
        if (pending.size === 0) {
            return;
        }

        const marks = Array.from(pending.entries())
            .filter(([, v]) => v.mark !== null)
            .map(([tweetId, v]) => ({
                tweetId,
                mark: v.mark!,
            }));

        if (marks.length === 0) {
            return;
        }

        const response = await fetch(`${apiHost}/marks/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-account-id": accountId,
            },
            body: JSON.stringify({ marks }),
        });

        if (!response.ok) {
            throw new Error(`marks sync failed with status ${response.status}`);
        }

        await response.json();
    };

    const pull = async (
        accountId: string,
        lastKnownVersion: number,
    ): Promise<{ marks: { tweetId: string; mark: Marks }[]; serverTime: number }> => {
        const params = new URLSearchParams();
        params.set("version", String(lastKnownVersion));

        const response = await fetch(`${apiHost}/marks?${params.toString()}`, {
            headers: { "x-account-id": accountId },
        });

        if (!response.ok) {
            throw new Error(`marks fetch failed with status ${response.status}`);
        }

        const data = Schema.decodeUnknownSync(MarksResponseSchema)(await response.json());

        return {
            marks: data.marks.map((m) => ({
                tweetId: m.tweetId,
                mark: m.mark,
            })),
            serverTime: data.serverTime,
        };
    };

    return { flushPending, pull };
}
