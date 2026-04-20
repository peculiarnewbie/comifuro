import { For, Show } from "solid-js";
import type { Marks } from "@comifuro/core/types";
import TweetCard from "../tweet";
import type {
    CatalogueTweetThread,
    MarksStoreSession,
} from "../../lib/catalogue-store";

export default function TweetGrid(props: {
    threads: CatalogueTweetThread[];
    marks: Record<string, Marks>;
    marksSession: MarksStoreSession | null;
    emptyMessage?: string;
}) {
    return (
        <Show
            when={props.threads.length > 0}
            fallback={
                <div class="rounded border border-dashed p-8 text-center text-sm text-gray-500">
                    {props.emptyMessage ?? "No tweets match the current search."}
                </div>
            }
        >
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <For each={props.threads}>
                    {(thread) => (
                        <TweetCard
                            thread={thread}
                            mark={props.marks[thread.groupId] ?? null}
                            onMark={(mark) =>
                                props.marksSession?.setMark(thread.groupId, mark)
                            }
                            onClearMark={() =>
                                props.marksSession?.clearMark(thread.groupId)
                            }
                        />
                    )}
                </For>
            </div>
        </Show>
    );
}
