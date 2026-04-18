import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import type { Marks } from "@comifuro/core/types";
import type { CatalogueTweet, CatalogueTweetThread } from "../lib/catalogue-store";

const MEDIA_HOST = "https://r2.comifuro.peculiarnewbie.com";

const createImageUrl = (image: string) => `${MEDIA_HOST}/${image}`;

const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleString();

const handleActivationKey = (event: KeyboardEvent, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
    }
};

export default function Tweet(props: {
    thread: CatalogueTweetThread;
    mark: Marks | null;
    onMark: (mark: Marks) => void;
    onClearMark: () => void;
}) {
    const [expanded, setExpanded] = createSignal(false);
    const [activeTweet, setActiveTweet] = createSignal<CatalogueTweet | null>(null);
    const [activeImageIndex, setActiveImageIndex] = createSignal(0);

    const rootTweet = () => props.thread.root;
    const threadTweets = () => [props.thread.root, ...props.thread.replies];
    const firstImage = (tweet: CatalogueTweet) => tweet.images[0];
    const thumbnailFor = (tweet: CatalogueTweet, index: number) =>
        tweet.thumbnails?.[index] ?? tweet.images[index] ?? null;
    const firstThumbnail = (tweet: CatalogueTweet) => thumbnailFor(tweet, 0);
    const markClass = (mark: Marks) =>
        props.mark === mark
            ? "bg-blue-600 text-white border-blue-600"
            : "border-gray-300 text-gray-700";

    const openDetail = (tweet: CatalogueTweet, imageIndex = 0) => {
        setActiveTweet(tweet);
        setActiveImageIndex(
            Math.max(0, Math.min(imageIndex, Math.max(tweet.images.length - 1, 0))),
        );
    };

    const closeDetail = () => {
        setActiveTweet(null);
        setActiveImageIndex(0);
    };

    const cycleImage = (direction: -1 | 1) => {
        const images = activeTweet()?.images ?? [];
        if (images.length <= 1) {
            return;
        }

        setActiveImageIndex((current) => {
            const nextIndex = current + direction;
            return (nextIndex + images.length) % images.length;
        });
    };

    createEffect(() => {
        const tweet = activeTweet();
        if (!tweet || typeof window === "undefined" || typeof document === "undefined") {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeDetail();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                cycleImage(-1);
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                cycleImage(1);
            }
        };

        window.addEventListener("keydown", handleWindowKeyDown);

        onCleanup(() => {
            window.removeEventListener("keydown", handleWindowKeyDown);
            document.body.style.overflow = previousOverflow;
        });
    });

    return (
        <>
            <article class="tweet overflow-hidden rounded-xl border bg-white shadow-sm">
                <div class="space-y-3 p-3">
                    <div
                        class="space-y-3 rounded-xl transition duration-200 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        role="button"
                        tabindex={0}
                        aria-label={`Open tweet by ${rootTweet().user}`}
                        onClick={() => openDetail(rootTweet())}
                        onKeyDown={(event) =>
                            handleActivationKey(event, () => openDetail(rootTweet()))
                        }
                    >
                        <div class="relative overflow-hidden rounded-xl bg-gray-100">
                            {firstImage(rootTweet()) ? (
                                <img
                                    class="aspect-[4/5] w-full object-cover"
                                    src={createImageUrl(firstThumbnail(rootTweet())!)}
                                    loading="lazy"
                                />
                            ) : (
                                <div class="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                                    No image
                                </div>
                            )}
                            <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent p-3 text-white">
                                <span class="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] backdrop-blur">
                                    open thread
                                </span>
                                <Show when={rootTweet().images.length > 1}>
                                    <span class="rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium backdrop-blur">
                                        {rootTweet().images.length} photos
                                    </span>
                                </Show>
                            </div>
                            <a
                                href={rootTweet().tweetUrl}
                                target="_blank"
                                rel="noreferrer"
                                class="absolute right-2 top-2 rounded-xl bg-blue-500/80 p-2 text-sm font-semibold text-white hover:bg-blue-500"
                                onClick={(event) => event.stopPropagation()}
                            >
                                view tweet
                            </a>
                        </div>
                        <div class="space-y-3 px-1 pb-1">
                            <div class="flex items-start justify-between gap-2">
                                <div>
                                    <h3 class="text-sm font-semibold">{rootTweet().user}</h3>
                                    <p class="text-xs text-gray-500">
                                        {formatTimestamp(rootTweet().timestamp)}
                                    </p>
                                </div>
                                <div class="flex flex-col items-end gap-2">
                                    <Show when={props.thread.replies.length > 0}>
                                        <button
                                            type="button"
                                            class="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setExpanded((value) => !value);
                                            }}
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
                        </div>
                    </div>
                    <Show when={expanded() && props.thread.replies.length > 0}>
                        <div class="space-y-3 border-t pt-3">
                            <For each={props.thread.replies}>
                                {(tweet) => (
                                    <div
                                        class="space-y-2 rounded-lg bg-gray-50 p-3 transition duration-200 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                        role="button"
                                        tabindex={0}
                                        aria-label={`Open follow-up ${tweet.threadPosition ?? ""} by ${tweet.user}`}
                                        onClick={() => openDetail(tweet)}
                                        onKeyDown={(event) =>
                                            handleActivationKey(event, () => openDetail(tweet))
                                        }
                                    >
                                        <div class="flex items-start justify-between gap-3">
                                            <div>
                                                <div class="text-xs font-medium text-gray-700">
                                                    follow-up {tweet.threadPosition}
                                                </div>
                                                <div class="text-xs text-gray-500">
                                                    {formatTimestamp(tweet.timestamp)}
                                                </div>
                                            </div>
                                            <a
                                                href={tweet.tweetUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                view tweet
                                            </a>
                                        </div>
                                        <Show when={firstImage(tweet)}>
                                            {(_image) => (
                                                <div class="relative overflow-hidden rounded-lg">
                                                    <img
                                                        class="aspect-[4/5] w-full rounded-lg object-cover"
                                                        src={createImageUrl(firstThumbnail(tweet)!)}
                                                        loading="lazy"
                                                    />
                                                    <Show when={tweet.images.length > 1}>
                                                        <span class="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                                                            {tweet.images.length} photos
                                                        </span>
                                                    </Show>
                                                </div>
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

            <Show when={activeTweet()}>
                {(tweet) => (
                    <Portal>
                        <div
                            class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm"
                            onClick={() => closeDetail()}
                        >
                            <div
                                class="relative grid max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]"
                                role="dialog"
                                aria-modal="true"
                                aria-label={`Tweet details for ${tweet().user}`}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    class="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
                                    onClick={() => closeDetail()}
                                >
                                    close
                                </button>
                                <div class="relative flex min-h-[22rem] items-center justify-center overflow-hidden bg-slate-950">
                                    <Show
                                        when={tweet().images[activeImageIndex()]}
                                        fallback={
                                            <div class="flex h-full min-h-[22rem] w-full items-center justify-center px-8 text-center text-sm text-slate-300">
                                                No images were attached to this tweet.
                                            </div>
                                        }
                                    >
                                        {(image) => (
                                            <img
                                                class="max-h-[calc(100vh-6rem)] w-full object-contain"
                                                src={createImageUrl(image())}
                                                alt={`Tweet media ${activeImageIndex() + 1}`}
                                            />
                                        )}
                                    </Show>
                                    <Show when={tweet().images.length > 1}>
                                        <button
                                            type="button"
                                            class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
                                            onClick={() => cycleImage(-1)}
                                            aria-label="Previous image"
                                        >
                                            prev
                                        </button>
                                        <button
                                            type="button"
                                            class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
                                            onClick={() => cycleImage(1)}
                                            aria-label="Next image"
                                        >
                                            next
                                        </button>
                                        <div class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4">
                                            <div class="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                                                {activeImageIndex() + 1} / {tweet().images.length}
                                            </div>
                                            <div class="flex flex-wrap justify-center gap-2">
                                                <For each={tweet().images}>
                                                    {(_image, index) => (
                                                        <button
                                                            type="button"
                                                            class={`overflow-hidden rounded-2xl border transition ${
                                                                index() === activeImageIndex()
                                                                    ? "border-white shadow-lg"
                                                                    : "border-white/20 opacity-70 hover:opacity-100"
                                                            }`}
                                                            onClick={() =>
                                                                setActiveImageIndex(index())
                                                            }
                                                            aria-label={`View image ${index() + 1}`}
                                                        >
                                                            <img
                                                                class="h-12 w-12 object-cover"
                                                                src={createImageUrl(
                                                                    thumbnailFor(tweet(), index())!,
                                                                )}
                                                                alt=""
                                                            />
                                                        </button>
                                                    )}
                                                </For>
                                            </div>
                                        </div>
                                    </Show>
                                </div>
                                <div class="flex max-h-[calc(100vh-2rem)] flex-col overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
                                    <div class="space-y-4 px-5 pb-5 pt-16">
                                        <div class="space-y-2">
                                            <div class="flex items-start justify-between gap-4">
                                                <div>
                                                    <h3 class="text-lg font-semibold text-slate-900">
                                                        {tweet().user}
                                                    </h3>
                                                    <p class="text-sm text-slate-500">
                                                        {formatTimestamp(tweet().timestamp)}
                                                    </p>
                                                </div>
                                                <a
                                                    href={tweet().tweetUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-blue-200 hover:text-blue-600"
                                                >
                                                    open on x
                                                </a>
                                            </div>
                                            <p class="text-sm leading-7 text-slate-700">
                                                {tweet().text}
                                            </p>
                                        </div>
                                        <Show
                                            when={
                                                tweet().inferredBoothId ||
                                                tweet().inferredFandoms.length > 0
                                            }
                                        >
                                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                    inferred metadata
                                                </div>
                                                <div class="mt-3 space-y-3 text-sm text-slate-600">
                                                    <Show when={tweet().inferredBoothId}>
                                                        <div>
                                                            <span class="font-medium text-slate-800">
                                                                booth
                                                            </span>{" "}
                                                            {tweet().inferredBoothId}
                                                        </div>
                                                    </Show>
                                                    <Show
                                                        when={
                                                            tweet().inferredFandoms.length > 0
                                                        }
                                                    >
                                                        <div class="flex flex-wrap gap-2">
                                                            <For
                                                                each={
                                                                    tweet().inferredFandoms
                                                                }
                                                            >
                                                                {(fandom) => (
                                                                    <span class="rounded-full bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200">
                                                                        {fandom}
                                                                    </span>
                                                                )}
                                                            </For>
                                                        </div>
                                                    </Show>
                                                </div>
                                            </div>
                                        </Show>
                                    </div>
                                    <Show when={threadTweets().length > 1}>
                                        <div class="border-t border-slate-200 px-5 py-5">
                                            <div class="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                                thread
                                            </div>
                                            <div class="space-y-3">
                                                <For each={threadTweets()}>
                                                    {(threadTweet, index) => (
                                                        <div
                                                            class={`rounded-2xl border p-3 transition ${
                                                                threadTweet.id === tweet().id
                                                                    ? "border-blue-200 bg-blue-50/70"
                                                                    : "border-slate-200 bg-white hover:border-slate-300"
                                                            }`}
                                                            role="button"
                                                            tabindex={0}
                                                            aria-label={`Open ${
                                                                index() === 0
                                                                    ? "root tweet"
                                                                    : `follow-up ${threadTweet.threadPosition ?? index()}`
                                                            }`}
                                                            onClick={() =>
                                                                openDetail(threadTweet)
                                                            }
                                                            onKeyDown={(event) =>
                                                                handleActivationKey(event, () =>
                                                                    openDetail(threadTweet),
                                                                )
                                                            }
                                                        >
                                                            <div class="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                                        {index() === 0
                                                                            ? "root tweet"
                                                                            : `follow-up ${threadTweet.threadPosition ?? index()}`}
                                                                    </div>
                                                                    <div class="mt-1 text-xs text-slate-500">
                                                                        {formatTimestamp(
                                                                            threadTweet.timestamp,
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <Show
                                                                    when={
                                                                        threadTweet.images.length > 0
                                                                    }
                                                                >
                                                                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                                        {threadTweet.images.length}{" "}
                                                                        photo
                                                                        {threadTweet.images.length >
                                                                        1
                                                                            ? "s"
                                                                            : ""}
                                                                    </span>
                                                                </Show>
                                                            </div>
                                                            <p class="mt-3 text-sm leading-6 text-slate-700">
                                                                {threadTweet.text}
                                                            </p>
                                                        </div>
                                                    )}
                                                </For>
                                            </div>
                                        </div>
                                    </Show>
                                </div>
                            </div>
                        </div>
                    </Portal>
                )}
            </Show>
        </>
    );
}
