import MiniSearch from "minisearch";
import type { SearchIndexState } from "./tweet-store";
import {
    groupTweetsIntoThreads,
    type CatalogueTweet,
    type CatalogueTweetThread,
} from "./tweet-store";
import { createTweetThreadSearchText } from "./tweet-search";

type SearchDocument = {
    id: string;
    searchText: string;
    updatedAt: number;
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
        updatedAt: Math.max(thread.root.updatedAt, ...thread.replies.map((t) => t.updatedAt)),
        searchText: createTweetThreadSearchText(thread.root, thread.replies),
    };
}

export type SearchIndexManager = {
    getState(): SearchIndexState;
    update(tweets: CatalogueTweet[]): void;
    search(
        query: string,
        threads: CatalogueTweetThread[],
        threadMap: Map<string, CatalogueTweetThread>,
    ): CatalogueTweetThread[];
};

export function createSearchIndexManager(): SearchIndexManager {
    const miniSearch = createSearchIndex();
    let indexedDocuments = new Map<string, SearchDocument>();
    let searchRevision = 0;
    let state: SearchIndexState = { ready: false, count: 0 };

    const getState = () => state;

    const update = (tweets: CatalogueTweet[]) => {
        const threads = groupTweetsIntoThreads(tweets);
        const revision = ++searchRevision;
        const nextDocuments = new Map(
            threads.map((thread) => {
                const doc = toSearchDocument(thread);
                return [thread.groupId, doc] satisfies [string, SearchDocument];
            }),
        );

        state = { ready: false, count: threads.length };

        void (async () => {
            const removedIds = [...indexedDocuments.keys()].filter((id) => !nextDocuments.has(id));

            for (const tweetId of removedIds) {
                if (revision !== searchRevision) return;
                if (miniSearch.has(tweetId)) {
                    miniSearch.discard(tweetId);
                }
            }

            let processed = 0;
            for (const [tweetId, doc] of nextDocuments.entries()) {
                if (revision !== searchRevision) return;

                const previous = indexedDocuments.get(tweetId);
                if (!miniSearch.has(tweetId)) {
                    miniSearch.add(doc);
                } else if (
                    !previous ||
                    previous.searchText !== doc.searchText ||
                    previous.updatedAt !== doc.updatedAt
                ) {
                    miniSearch.replace(doc);
                }

                processed += 1;
                if (processed % 200 === 0) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }
            }

            indexedDocuments = nextDocuments;
            state = { ready: true, count: miniSearch.documentCount };
        })();
    };

    const search = (
        query: string,
        threads: CatalogueTweetThread[],
        threadMap: Map<string, CatalogueTweetThread>,
    ): CatalogueTweetThread[] => {
        if (!query.trim()) return threads;

        if (!state.ready) {
            return threads.filter((thread) => {
                const text = createTweetThreadSearchText(thread.root, thread.replies);
                const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
                return tokens.every((token) => text.toLowerCase().includes(token));
            });
        }

        const queries = query
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean);
        if (queries.length === 0) return threads;

        return miniSearch
            .search({ combineWith: "AND", queries }, { prefix: true })
            .map((result) => threadMap.get(result.id))
            .filter((thread): thread is CatalogueTweetThread => Boolean(thread));
    };

    return { getState, update, search };
}
