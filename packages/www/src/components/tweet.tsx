import type { Marks } from "@comifuro/core/types";
import type { CatalogueTweet } from "../lib/catalogue-store";

export default function Tweet(props: {
    tweet: CatalogueTweet;
    mark: Marks | null;
    onMark: (mark: Marks) => void;
    onClearMark: () => void;
}) {
    const firstImage = () => props.tweet.images[0];
    const markClass = (mark: Marks) =>
        props.mark === mark
            ? "bg-blue-600 text-white border-blue-600"
            : "border-gray-300 text-gray-700";

    return (
        <article class="tweet overflow-hidden rounded-xl border bg-white shadow-sm">
            <div class="relative bg-gray-100">
                {firstImage() ? (
                    <img
                        class="aspect-[4/5] w-full object-cover"
                        src={`https://r2.comifuro.peculiarnewbie.com/${firstImage()}`}
                        loading="lazy"
                    />
                ) : (
                    <div class="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                        No image
                    </div>
                )}
                <a
                    href={props.tweet.tweetUrl}
                    target="_blank"
                    class="absolute right-2 top-2 rounded-xl bg-blue-500/80 p-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                    view tweet
                </a>
            </div>
            <div class="space-y-3 p-3">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <h3 class="text-sm font-semibold">{props.tweet.user}</h3>
                        <p class="text-xs text-gray-500">
                            {new Date(props.tweet.timestamp).toLocaleString()}
                        </p>
                    </div>
                    {props.mark ? (
                        <span class="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize">
                            {props.mark}
                        </span>
                    ) : null}
                </div>
                <p class="text-sm leading-6">{props.tweet.text}</p>
                {props.tweet.inferredBoothId ||
                props.tweet.inferredFandoms.length > 0 ? (
                    <div class="space-y-2 text-xs text-gray-500">
                        {props.tweet.inferredBoothId ? (
                            <div>
                                <span class="font-medium text-gray-600">
                                    inferred booth
                                </span>{" "}
                                {props.tweet.inferredBoothId}
                            </div>
                        ) : null}
                        {props.tweet.inferredFandoms.length > 0 ? (
                            <div class="flex flex-wrap gap-1.5">
                                {props.tweet.inferredFandoms.map((fandom) => (
                                    <span class="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                                        {fandom}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
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
