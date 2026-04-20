import { For, Show, createEffect, createSignal } from "solid-js";
import type { CatalogueTweet } from "../../lib/catalogue-store";
import { createImageUrl } from "../../lib/media";
import { formatTimestamp } from "../../lib/time";
import ActionButton from "./ActionButton";

export default function AdminTweetRow(props: {
    tweet: CatalogueTweet;
    label: string;
    pendingKeys: Record<string, boolean>;
    onSaveFandoms: (tweetId: string, value: string) => Promise<void>;
    onSaveTags: (tweetId: string, value: string) => Promise<void>;
    onMakeRoot?: (tweetId: string) => Promise<void>;
    onUncatalogue: (tweetId: string) => Promise<void>;
    onRemoveFollowUp?: (tweetId: string) => Promise<void>;
}) {
    const [fandomDraft, setFandomDraft] = createSignal("");
    const [tagDraft, setTagDraft] = createSignal("");

    createEffect(() => {
        setFandomDraft(props.tweet.inferredFandoms.join(", "));
        setTagDraft(props.tweet.matchedTags.join(", "));
    });

    const firstImage = () =>
        props.tweet.thumbnails?.[0] ?? props.tweet.images[0];

    return (
        <section class="rounded-[1.5rem] border border-stone-200 bg-white/90 p-4 shadow-[0_20px_60px_-50px_rgba(41,37,36,0.45)]">
            <div class="flex flex-col gap-4 xl:flex-row">
                <div class="flex items-start gap-4 xl:w-[16rem] xl:flex-none">
                    <div class="relative overflow-hidden rounded-[1.25rem] border border-stone-200 bg-stone-100">
                        <Show
                            when={firstImage()}
                            fallback={
                                <div class="flex h-28 w-24 items-center justify-center px-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                    no image
                                </div>
                            }
                        >
                            {(image) => (
                                <img
                                    class="h-28 w-24 object-cover"
                                    src={createImageUrl(image())}
                                    alt=""
                                    loading="lazy"
                                />
                            )}
                        </Show>
                    </div>
                    <div class="min-w-0 space-y-2">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                            {props.label}
                        </div>
                        <div class="font-[Georgia,_serif] text-lg leading-none text-stone-900">
                            @{props.tweet.user}
                        </div>
                        <div class="text-xs text-stone-500">
                            {formatTimestamp(props.tweet.timestamp)}
                        </div>
                        <a
                            href={props.tweet.tweetUrl}
                            target="_blank"
                            rel="noreferrer"
                            class="inline-flex rounded-full border border-stone-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500"
                        >
                            open tweet
                        </a>
                    </div>
                </div>

                <div class="min-w-0 flex-1 space-y-4">
                    <p class="text-sm leading-7 text-stone-700">{props.tweet.text}</p>

                    <div class="grid gap-4 xl:grid-cols-2">
                        <div class="space-y-2 rounded-[1.25rem] border border-stone-200 bg-stone-50/80 p-3">
                            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                fandoms
                            </div>
                            <textarea
                                rows={3}
                                value={fandomDraft()}
                                onInput={(event) =>
                                    setFandomDraft(event.currentTarget.value)
                                }
                                class="min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                                placeholder="Blue Archive, Uma Musume"
                            />
                            <div class="flex flex-wrap gap-2">
                                <ActionButton
                                    label={
                                        props.pendingKeys[`fandom:${props.tweet.id}`]
                                            ? "saving"
                                            : "save fandoms"
                                    }
                                    tone="primary"
                                    disabled={props.pendingKeys[`fandom:${props.tweet.id}`]}
                                    onClick={() =>
                                        void props.onSaveFandoms(
                                            props.tweet.id,
                                            fandomDraft(),
                                        )
                                    }
                                />
                                <For each={props.tweet.inferredFandoms}>
                                    {(tag) => (
                                        <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
                                            {tag}
                                        </span>
                                    )}
                                </For>
                            </div>
                        </div>

                        <div class="space-y-2 rounded-[1.25rem] border border-stone-200 bg-stone-50/80 p-3">
                            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                manual tags
                            </div>
                            <textarea
                                rows={3}
                                value={tagDraft()}
                                onInput={(event) => setTagDraft(event.currentTarget.value)}
                                class="min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-400"
                                placeholder="#cf22, featured"
                            />
                            <div class="flex flex-wrap gap-2">
                                <ActionButton
                                    label={
                                        props.pendingKeys[`tags:${props.tweet.id}`]
                                            ? "saving"
                                            : "save tags"
                                    }
                                    tone="primary"
                                    disabled={props.pendingKeys[`tags:${props.tweet.id}`]}
                                    onClick={() =>
                                        void props.onSaveTags(props.tweet.id, tagDraft())
                                    }
                                />
                                <For each={props.tweet.matchedTags}>
                                    {(tag) => (
                                        <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
                                            {tag}
                                        </span>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <Show when={props.onMakeRoot}>
                            <ActionButton
                                label={
                                    props.pendingKeys[`reroot:${props.tweet.id}`]
                                        ? "updating"
                                        : "make root"
                                }
                                tone="subtle"
                                disabled={props.pendingKeys[`reroot:${props.tweet.id}`]}
                                onClick={() => void props.onMakeRoot?.(props.tweet.id)}
                            />
                        </Show>
                        <ActionButton
                            label={
                                props.pendingKeys[`uncatalogue:${props.tweet.id}`]
                                    ? "updating"
                                    : "uncatalogue"
                            }
                            tone="danger"
                            disabled={props.pendingKeys[`uncatalogue:${props.tweet.id}`]}
                            onClick={() => void props.onUncatalogue(props.tweet.id)}
                        />
                        <Show when={props.onRemoveFollowUp}>
                            <ActionButton
                                label={
                                    props.pendingKeys[`remove:${props.tweet.id}`]
                                        ? "updating"
                                        : "remove follow-up"
                                }
                                tone="danger"
                                disabled={props.pendingKeys[`remove:${props.tweet.id}`]}
                                onClick={() =>
                                    void props.onRemoveFollowUp?.(props.tweet.id)
                                }
                            />
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    );
}
