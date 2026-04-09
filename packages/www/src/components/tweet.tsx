import { For, Show, createSignal } from "solid-js";
import type { Marks } from "@comifuro/core/types";
import type { CatalogueTweet, CatalogueTweetThread } from "../lib/catalogue-store";

export default function Tweet(props: {
    thread: CatalogueTweetThread;
    mark: Marks | null;
    onMark: (mark: Marks) => void;
    onClearMark: () => void;
}) {
    const [expanded, setExpanded] = createSignal(false);
    const rootTweet = () => props.thread.root;
    const firstImage = (tweet: CatalogueTweet) => tweet.images[0];
    const markClass = (mark: Marks) =>
        props.mark === mark
            ? "bg-blue-600 text-white border-blue-600"
            : "border-gray-300 text-gray-700";

    return (
        <article class="tweet overflow-hidden rounded-xl border bg-white shadow-sm">
            <div class="relative bg-gray-100">
                {firstImage(rootTweet()) ? (
                    <img
                        class="aspect-[4/5] w-full object-cover"
                        src={`https://r2.comifuro.peculiarnewbie.com/${firstImage(rootTweet())}`}
                        loading="lazy"
                    />
                ) : (
                    <div class="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                        No image
                    </div>
                )}
                <a
                    href={rootTweet().tweetUrl}
                    target="_blank"
                    class="absolute right-2 top-2 rounded-xl bg-blue-500/80 p-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                    view tweet
                </a>
            </div>
            <div class="space-y-3 p-3">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <h3 class="text-sm font-semibold">{rootTweet().user}</h3>
                        <p class="text-xs text-gray-500">
                            {new Date(rootTweet().timestamp).toLocaleString()}
                        </p>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <Show when={props.thread.replies.length > 0}>
                            <button
                                type="button"
                                class="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600"
                                onClick={() => setExpanded((value) => !value)}
                            >
                                {expanded()
                                    ? `hide ${props.thread.replies.length} follow-ups`
                                    : `+${props.thread.replies.length} follow-ups`}
                            </button>
                        </Show>
                        {props.mark ? (
                            <span class="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize">
                                {props.mark}
                            </span>
                        ) : null}
                    </div>
                </div>
                <p class="text-sm leading-6">{rootTweet().text}</p>
                {rootTweet().inferredBoothId ||
                rootTweet().inferredFandoms.length > 0 ? (
                    <div class="space-y-2 text-xs text-gray-500">
                        {rootTweet().inferredBoothId ? (
                            <div>
                                <span class="font-medium text-gray-600">
                                    inferred booth
                                </span>{" "}
                                {rootTweet().inferredBoothId}
                            </div>
                        ) : null}
                        {rootTweet().inferredFandoms.length > 0 ? (
                            <div class="flex flex-wrap gap-1.5">
                                {rootTweet().inferredFandoms.map((fandom) => (
                                    <span class="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                        {fandom}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <Show when={expanded() && props.thread.replies.length > 0}>
                    <div class="space-y-3 border-t pt-3">
                        <For each={props.thread.replies}>
                            {(tweet) => (
                                <div class="space-y-2 rounded-lg bg-gray-50 p-3">
                                    <div class="flex items-start justify-between gap-3">
                                        <div>
                                            <div class="text-xs font-medium text-gray-700">
                                                follow-up {tweet.threadPosition}
                                            </div>
                                            <div class="text-xs text-gray-500">
                                                {new Date(tweet.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        <a
                                            href={tweet.tweetUrl}
                                            target="_blank"
                                            class="text-xs font-medium text-blue-600 hover:text-blue-700"
                                        >
                                            view tweet
                                        </a>
                                    </div>
                                    <Show when={firstImage(tweet)}>
                                        {(image) => (
                                            <img
                                                class="aspect-[4/5] w-full rounded-lg object-cover"
                                                src={`https://r2.comifuro.peculiarnewbie.com/${image()}`}
                                                loading="lazy"
                                            />
                                        )}
                                    </Show>
                                    <p class="text-sm leading-6 text-gray-700">
                                        {tweet.text}
                                    </p>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
                <div class="flex flex-wrap gap-2">
                    <button
                        type="button"
                        class={`rounded border px-3 py-1 text-xs ${markClass("bookmarked")}`}
                        onClick={() => props.onMark("bookmarked")}
                    >
                        bookmark
                    </button>
                    <button
                        type="button"
                        class={`rounded border px-3 py-1 text-xs ${markClass("ignored")}`}
                        onClick={() => props.onMark("ignored")}
                    >
                        ignore
                    </button>
                    <button
                        type="button"
                        class="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700"
                        onClick={() => props.onClearMark()}
                    >
                        clear
                    </button>
                </div>
            </div>
        </article>
    );
}
