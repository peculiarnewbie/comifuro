import { For, Show } from "solid-js";
import type { CatalogueTweetThread, TweetStoreSession, SearchIndexState } from "../../lib/catalogue-store";
import ActionButton from "../admin/ActionButton";
import AdminTweetRow from "../admin/AdminTweetRow";
import SearchBar from "../catalogue/SearchBar";

function statusClass(tone: "success" | "error" | "info") {
    switch (tone) {
        case "success":
            return "border-emerald-300/70 bg-emerald-50 text-emerald-900";
        case "error":
            return "border-rose-300/70 bg-rose-50 text-rose-900";
        default:
            return "border-amber-300/70 bg-amber-50 text-amber-950";
    }
}

export default function AdminPanel(props: {
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
    adminPassword: string;
    setAdminPassword: (value: string) => void;
    statusBanner: { tone: "success" | "error" | "info"; message: string } | null;
    pendingActions: Record<string, boolean>;
    saveFandoms: (tweetId: string, value: string) => Promise<void>;
    saveTags: (tweetId: string, value: string) => Promise<void>;
    makeRoot: (thread: CatalogueTweetThread, tweetId: string) => Promise<void>;
    uncatalogue: (tweetId: string) => Promise<void>;
    removeFollowUp: (tweetId: string) => Promise<void>;
    tweetSession: TweetStoreSession | null;
    searchIndexState: SearchIndexState;
}) {
    return (
        <main class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.16),_transparent_35%),linear-gradient(180deg,_#fffaf2_0%,_#f5f5f4_52%,_#fafaf9_100%)] text-stone-800">
            <div
                class="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {props.statusBanner?.message ?? ""}
            </div>
            <div
                class="sr-only"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
            >
                {props.syncError ?? ""}
            </div>
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
                                        {props.eventId}
                                    </div>
                                </div>
                                <div class="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
                                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                        cached tweets
                                    </div>
                                    <div class="mt-2 font-[Georgia,_serif] text-3xl text-stone-950">
                                        {props.tweetCount}
                                    </div>
                                </div>
                                <div class="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
                                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                        visible threads
                                    </div>
                                    <div class="mt-2 font-[Georgia,_serif] text-3xl text-stone-950">
                                        {props.filteredThreads.length}
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
                                        value={props.adminPassword}
                                        onInput={(event) =>
                                            props.setAdminPassword(
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
                                        props.eventId === "cf22"
                                            ? "primary"
                                            : "subtle"
                                    }
                                    onClick={() => props.setEvent("cf22")}
                                />
                                <ActionButton
                                    label="cf21"
                                    tone={
                                        props.eventId === "cf21"
                                            ? "primary"
                                            : "subtle"
                                    }
                                    onClick={() => props.setEvent("cf21")}
                                />
                                <ActionButton
                                    label="sync now"
                                    tone="subtle"
                                    onClick={() => {
                                        void props.tweetSession?.syncOnce();
                                    }}
                                />
                            </div>
                            <label class="block">
                                <span class="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                                    search
                                </span>
                                <SearchBar
                                    value={props.searchValue}
                                    onChange={props.setSearchValue}
                                    suggestions={props.tagSuggestions}
                                    onSelectSuggestion={props.applyTagSuggestion}
                                    onFocus={() => props.setSearchFocused(true)}
                                    onBlur={() => props.setSearchFocused(false)}
                                    placeholder="Search user, text, fandom, booth, or manual tag"
                                    variant="dark"
                                />
                            </label>
                            <div class="space-y-1 text-xs text-stone-400">
                                <div>
                                    sync: {props.syncStatus}{" "}
                                    {props.bootstrapComplete
                                        ? "(ready)"
                                        : "(bootstrapping)"}
                                </div>
                                <div>
                                    search indexed:{" "}
                                    {props.searchIndexState.count}
                                </div>
                                <Show when={props.lastSyncedAt}>
                                    {(value) => (
                                        <div>
                                            last sync:{" "}
                                            {new Date(
                                                value(),
                                            ).toLocaleString()}
                                        </div>
                                    )}
                                </Show>
                                <Show when={props.syncError}>
                                    {(message) => (
                                        <div class="text-rose-300">
                                            {message()}
                                        </div>
                                    )}
                                </Show>
                            </div>
                        </div>
                    </div>
                </section>

                <div class="mt-4 space-y-4">
                    <div class="rounded-[1.5rem] border border-stone-200 bg-white/75 px-4 py-3 text-sm text-stone-600 shadow-[0_20px_60px_-50px_rgba(41,37,36,0.4)] backdrop-blur">
                        Admin mode is only shown when `?admin=1` is present in
                        the URL.
                    </div>

                    <Show when={props.statusBanner}>
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
                        when={props.filteredThreads.length > 0}
                        fallback={
                            <div class="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center text-sm text-stone-500">
                                {props.tweetCount === 0
                                    ? "No catalogue tweets are cached yet."
                                    : "No threads match the current search."}
                            </div>
                        }
                    >
                        <For each={props.filteredThreads}>
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
                                                    {thread.replies.length}{" "}
                                                    follow-up
                                                    {thread.replies.length ===
                                                    1
                                                        ? ""
                                                        : "s"}
                                                </span>
                                                <Show
                                                    when={
                                                        thread.root
                                                            .inferredBoothId
                                                    }
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
                                            pendingKeys={props.pendingActions}
                                            onSaveFandoms={props.saveFandoms}
                                            onSaveTags={props.saveTags}
                                            onUncatalogue={props.uncatalogue}
                                        />

                                        <For each={thread.replies}>
                                            {(tweet) => (
                                                <AdminTweetRow
                                                    tweet={tweet}
                                                    label={`follow-up ${tweet.threadPosition ?? ""}`}
                                                    pendingKeys={
                                                        props.pendingActions
                                                    }
                                                    onSaveFandoms={
                                                        props.saveFandoms
                                                    }
                                                    onSaveTags={
                                                        props.saveTags
                                                    }
                                                    onMakeRoot={(tweetId) =>
                                                        props.makeRoot(
                                                            thread,
                                                            tweetId,
                                                        )
                                                    }
                                                    onUncatalogue={
                                                        props.uncatalogue
                                                    }
                                                    onRemoveFollowUp={
                                                        props.removeFollowUp
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
    );
}
