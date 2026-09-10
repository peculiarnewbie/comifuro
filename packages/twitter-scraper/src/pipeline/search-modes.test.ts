import assert from "node:assert/strict";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSearch, scopedStateId, type SearchSource } from "./search-modes";
import { RunStore } from "../run-store";
import { Runtime } from "../runtime";
import { ApiClient } from "../api-client";
import type { ExtractedTweet, ScraperConfig } from "../types";

const cleanup: (() => void)[] = [];
afterEach(() => {
    for (const fn of cleanup.splice(0).reverse()) fn();
});
const tweet = (id: string): ExtractedTweet => ({
    id,
    user: "artist",
    displayName: null,
    text: "catalogue",
    tweetUrl: `https://x.com/artist/status/${id}`,
    timestamp: "2026-04-01T00:00:00Z",
    matchedTags: [],
    previewImageUrls: [],
    hasQuotedTweet: false,
    rootTweetId: null,
    parentTweetId: null,
    threadPosition: null,
    discoverySource: "search",
});
class TestRuntime extends Runtime {
    waits: number[] = [];
    override async wait(ms: number) {
        this.signal.throwIfAborted();
        this.waits.push(ms);
    }
}
function fixture(checkpoint: string | null = null) {
    const dir = mkdtempSync(join(tmpdir(), "scraper-search-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const store = new RunStore(join(dir, "runs.sqlite"));
    store.acquire();
    cleanup.push(() => store.close());
    const writes: Record<string, unknown>[] = [];
    let exports = 0;
    let failExport = false;
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            if (request.url.endsWith("export-public-feed")) {
                exports += 1;
                return Response.json({ ok: !failExport }, { status: failExport ? 400 : 200 });
            }
            if (request.method === "PUT") {
                writes.push(await request.json());
                return Response.json({ ok: true });
            }
            return Response.json(checkpoint ? { checkpoint } : null);
        },
    });
    cleanup.push(() => {
        void server.stop(true);
    });
    const controller = new AbortController();
    const runtime = new TestRuntime(controller.signal);
    const apiClient = new ApiClient({
        apiBaseUrl: server.url.toString(),
        apiPassword: "test",
        runtime,
    });
    const config: ScraperConfig = {
        apiBaseUrl: server.url.toString(),
        apiPassword: "test",
        eventId: "cf22",
        stateId: "x-search:cf22",
        searchQuery: "#cf22",
        browserCdpUrl: "http://localhost:9222",
        scraperPageUrlMatch: "https://x.com/",
        scrollDelayMs: 3000,
        idleScrollLimit: 1,
        threadScrollDelayMs: 1500,
        threadIdleScrollLimit: 2,
        opencodeBaseUrl: "http://localhost:4097",
        opencodeManaged: false,
        opencodeBin: "opencode",
        classifierPromptPath: "prompt",
        runMode: "default",
        searchMaxId: null,
        searchSinceDate: null,
        updateState: true,
        maxIdReloadPageLimit: 3,
        runDbPath: store.path,
        maxScrollsPerPage: 2,
        pageDelayMs: 15000,
    };
    const processed: string[] = [];
    const processTweet = async (input: ExtractedTweet) => {
        processed.push(input.id);
        return 1;
    };
    const run = (source: SearchSource, overrides: Partial<Parameters<typeof runSearch>[0]> = {}) =>
        runSearch({
            config,
            store,
            apiClient,
            source,
            processTweet,
            signal: controller.signal,
            runtime,
            promptVersion: "v1",
            ...overrides,
        });
    return {
        run,
        config,
        processed,
        store,
        writes,
        runtime,
        controller,
        exports: () => exports,
        failExport: () => {
            failExport = true;
        },
    };
}
function timeline(pages: string[][]) {
    const queries: string[] = [];
    let page = -1;
    const source: SearchSource = {
        open: async (query) => {
            queries.push(query);
            page += 1;
        },
        read: async () => {
            const ids = pages[page] ?? [];
            return { tweets: ids.map(tweet), empty: ids.length === 0 };
        },
        scroll: async () => {},
    };
    return { source, queries };
}

describe("search recovery", () => {
    test("bootstraps a fresh state and advances only after reaching a confirmed boundary", async () => {
        const f = fixture();
        const t = timeline([["110", "120"], []]);
        expect((await f.run(t.source)).status).toBe("completed");
        expect(f.processed).toEqual(["120", "110"]);
        expect(t.queries[1]).toContain("max_id:109");
        expect(f.writes[0]?.checkpoint).toBe("120");
        expect(f.exports()).toBe(1);
    });

    test("processes out-of-order new tweets before stopping at the old checkpoint", async () => {
        const f = fixture("100");
        await f.run(timeline([["100", "130", "120"]]).source);
        expect(f.processed).toEqual(["130", "120"]);
        expect(f.writes[0]?.checkpoint).toBe("130");
    });

    test("does not commit over a failed tweet and retries its durable payload first", async () => {
        const f = fixture("100");
        const failed = await f.run(timeline([["130", "120", "100"]]).source, {
            processTweet: async (input) => {
                if (input.id === "120") throw new Error("upload failed");
                f.processed.push(input.id);
                return 1;
            },
        });
        expect(failed.reason).toBe("pending-failures");
        expect(failed.status).toBe("paused");
        expect(f.writes).toHaveLength(0);
        expect(f.store.status()[0]?.nextTweetId).toBe("120");
        const result = await f.run(timeline([["130", "100"]]).source);
        expect(result.status).toBe("completed");
        expect(f.processed).toEqual(["130", "120"]);
        expect(f.writes[0]?.checkpoint).toBe("130");
    });

    test("page-limited backfills resume their cursor without touching the default checkpoint", async () => {
        const f = fixture();
        f.config.runMode = "max-id";
        f.config.maxIdReloadPageLimit = 1;
        f.config.searchMaxId = "200";
        const first = await f.run(timeline([["190", "180"]]).source);
        expect(first.status).toBe("paused");
        const next = timeline([["179", "170"]]);
        const second = await f.run(next.source);
        expect(second.runId).toBe(first.runId);
        expect(next.queries[0]).toContain("max_id:179");
        expect(f.writes).toHaveLength(0);
    });

    test("an ambiguous empty timeline pauses without advancing checkpoints", async () => {
        const f = fixture("100");
        const result = await f.run({
            open: async () => {},
            read: async () => ({ tweets: [], empty: false }),
            scroll: async () => {},
        });
        expect(result.reason).toBe("timeline-stalled");
        expect(result.status).toBe("paused");
        expect(f.writes).toHaveLength(0);
    });

    test("an interrupted run retains its task and its cooldown", async () => {
        const f = fixture();
        await assert.rejects(
            f.run(timeline([["120"]]).source, {
                processTweet: async (_tweet, runtime) => {
                    runtime.onCooldown(Date.now() + 900_000, "HTTP 429");
                    f.controller.abort();
                    runtime.signal.throwIfAborted();
                    return 0;
                },
            }),
        );
        expect(f.store.status()[0]?.status).toBe("paused");
        expect(f.store.status()[0]?.nextTweetId).toBe("120");
        expect(f.store.status()[0]?.progress.notBefore).toBeGreaterThan(Date.now());
        expect(f.writes).toHaveLength(0);
    });

    test("feed export failure leaves a completed scan resumable without reprocessing tweets", async () => {
        const f = fixture("100");
        f.failExport();
        await assert.rejects(f.run(timeline([["120", "100"]]).source), /HTTP 400/);
        expect(f.store.status()[0]?.progress.boundaryReached).toBe(true);
        expect(f.store.status()[0]?.progress.exportPending).toBe(true);
        expect(f.writes).toHaveLength(0);
    });
});

test("remote checkpoints are isolated when search terms or dates change", () => {
    const f = fixture();
    const first = scopedStateId(f.config);
    expect(scopedStateId({ ...f.config, searchQuery: "#other" })).not.toBe(first);
    expect(scopedStateId({ ...f.config, searchSinceDate: "2026-01-01" })).not.toBe(first);
});

test("one bad tweet does not prevent saving other results, but three consecutive failures stop the run", async () => {
    const f = fixture("100");
    const result = await f.run(timeline([["130", "120", "110", "100"]]).source, {
        processTweet: async (input) => {
            if (input.id === "120") throw new Error("bad image");
            f.processed.push(input.id);
            return 1;
        },
    });
    expect(f.processed).toEqual(["130", "110"]);
    expect(result.reason).toBe("pending-failures");
    expect(f.writes).toHaveLength(0);
    const other = fixture();
    await assert.rejects(
        other.run(timeline([["140", "130", "120", "110"]]).source, {
            processTweet: async () => {
                throw new Error("broken classifier");
            },
        }),
        /broken classifier/,
    );
    expect(other.store.status()[0]?.pending).toBe(4);
});
