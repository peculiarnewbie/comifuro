import { For, Show } from "solid-js";
import type { Marks } from "@comifuro/core/types";
import TweetCard from "../tweet";
import SearchBar from "./SearchBar";
import type {
    CatalogueTweetThread,
    MarksStoreSession,
    TweetStoreSession,
    SearchIndexState,
} from "../../lib/catalogue-store";

export default function CataloguePage(props: {
    eventId: string;
    setEvent: (eventId: string) => void;
    tweetCount: number;
    syncStatus: string;
    syncError: string | null;
    lastSyncedAt: number | null;
    bootstrapComplete: boolean;
    searchValue: string;
    setSearchValue: (value: string) => void;
    searchFocused: boolean;
    setSearchFocused: (focused: boolean) => void;
    tagSuggestions: string[];
    applyTagSuggestion: (tag: string) => void;
    filteredThreads: CatalogueTweetThread[];
    marks: Record<string, Marks>;
    marksSession: MarksStoreSession | null;
    tweetSession: TweetStoreSession | null;
    searchIndexState: SearchIndexState;
}) {
    return (
        <main class="mx-auto max-w-7xl p-4 text-gray-700">
            <div
                class="sr-only"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
            >
                {props.syncError ?? ""}
            </div>
            <div class="mb-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => props.setEvent("cf22")}
                >
                    cf22
                </button>
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => props.setEvent("cf21")}
                >
                    cf21
                </button>
                <button
                    type="button"
                    class="rounded border px-3 py-1"
                    onClick={() => {
                        void props.tweetSession?.syncOnce();
                    }}
                >
                    sync now
                </button>
            </div>

            <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1 text-sm">
                    <div>event: {props.eventId}</div>
                    <div>tweets cached: {props.tweetCount}</div>
                    <div>search indexed: {props.searchIndexState.count}</div>
                    <div>filtered: {props.filteredThreads.length}</div>
                    <div>
                        sync: {props.syncStatus}
                        {props.bootstrapComplete
                            ? " (ready)"
                            : " (bootstrapping)"}
                    </div>
                    <Show when={props.lastSyncedAt}>
                        {(value) => (
                            <div>
                                last sync:{" "}
                                {new Date(value()).toLocaleString()}
                            </div>
                        )}
                    </Show>
                    <Show when={props.syncError}>
                        {(message) => (
                            <div class="text-red-600">{message()}</div>
                        )}
                    </Show>
                </div>

                <div class="relative w-full sm:max-w-sm">
                    <SearchBar
                        value={props.searchValue}
                        onChange={props.setSearchValue}
                        suggestions={props.tagSuggestions}
                        onSelectSuggestion={props.applyTagSuggestion}
                        onFocus={() => props.setSearchFocused(true)}
                        onBlur={() => props.setSearchFocused(false)}
                        placeholder="Search tweets"
                    />
                </div>
            </div>

            <Show
                when={props.filteredThreads.length > 0}
                fallback={
                    <div class="rounded border border-dashed p-8 text-center text-sm text-gray-500">
                        {props.tweetCount === 0
                            ? "No tweets cached yet."
                            : "No tweets match the current search."}
                    </div>
                }
            >
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <For each={props.filteredThreads}>
                        {(thread) => (
                            <TweetCard
                                thread={thread}
                                mark={props.marks[thread.groupId] ?? null}
                                onMark={(mark) =>
                                    props.marksSession?.setMark(
                                        thread.groupId,
                                        mark,
                                    )
                                }
                                onClearMark={() =>
                                    props.marksSession?.clearMark(
                                        thread.groupId,
                                    )
                                }
                            />
                        )}
                    </For>
                </div>
            </Show>
        </main>
    );
}
