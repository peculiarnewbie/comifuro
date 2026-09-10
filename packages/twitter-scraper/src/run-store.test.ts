import { spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "./run-store";
import type { ExtractedTweet } from "./types";

const directories: string[] = [];
afterEach(() => {
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
export const makeTweet = (id: string): ExtractedTweet => ({
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
function path() {
    const dir = mkdtempSync(join(tmpdir(), "scraper-store-"));
    directories.push(dir);
    return join(dir, "runs.sqlite");
}

describe("durable run journal", () => {
    test("resumes pending work and records interruption across process lifetimes", () => {
        const dbPath = path();
        let store = new RunStore(dbPath);
        store.acquire();
        const run = store.start({ query: "#cf22" }, "100", null);
        store.enqueue(run.id, [makeTweet("120"), makeTweet("110")]);
        store.beginTask(run.id, "120");
        run.progress.notBefore = Date.now() + 900_000;
        store.completeTask(run.id, "120", 1, run.progress);
        store.failTask(run.id, "110", "HTTP 503");
        store.close();
        store = new RunStore(dbPath);
        store.acquire();
        const resumed = store.start({ query: "#cf22" }, "999", null);
        expect(resumed.id).toBe(run.id);
        expect(resumed.progress.checkpoint).toBe("100");
        expect(resumed.progress.notBefore).toBe(run.progress.notBefore);
        expect(store.pending(run.id)?.id).toBe("110");
        expect(store.status()[0]?.pending).toBe(1);
        store.close();
    });

    test("prevents concurrent writers and permits reuse after release", () => {
        const dbPath = path();
        const first = new RunStore(dbPath);
        first.acquire();
        const second = new RunStore(dbPath);
        expect(() => second.acquire()).toThrow("in use");
        second.close();
        first.close();
        const next = new RunStore(dbPath);
        next.acquire();
        next.close();
    });

    test("isolates search scopes and starts a new run after completion", () => {
        const store = new RunStore(path());
        store.acquire();
        const first = store.start({ query: "one" }, null, null);
        const different = store.start({ query: "two" }, null, null);
        expect(first.id).not.toBe(different.id);
        store.finish(first, "completed", "exhausted");
        expect(store.start({ query: "one" }, null, null).id).not.toBe(first.id);
        store.close();
    });
});

test("keeps completed stage artifacts when resuming a failed tweet", () => {
    const dbPath = path();
    let store = new RunStore(dbPath);
    store.acquire();
    const run = store.start({ query: "#cf22" }, null, null);
    store.enqueue(run.id, [makeTweet("120")]);
    store.taskJournal(run.id, "120").write("root-result", { accepted: true });
    store.taskJournal(run.id, "120").write("thread-chain", [makeTweet("121")]);
    store.failTask(run.id, "120", "upload failed");
    store.close();
    store = new RunStore(dbPath);
    store.acquire();
    const resumed = store.start({ query: "#cf22" }, null, null);
    expect(store.taskJournal(resumed.id, "120").read("root-result")).toEqual({ accepted: true });
    expect(store.taskJournal(resumed.id, "120").read("thread-chain")).toEqual([makeTweet("121")]);
    store.close();
});

test("recovers the durable queue and writer lock after SIGKILL", async () => {
    const dbPath = path();
    const moduleUrl = new URL("./run-store.ts", import.meta.url).href;
    const script = `import { RunStore } from ${JSON.stringify(moduleUrl)};
        const store = new RunStore(${JSON.stringify(dbPath)}); store.acquire();
        const run = store.start({ query: "crash" }, null, "190");
        store.enqueue(run.id, [${JSON.stringify(makeTweet("180"))}]);
        process.stdout.write("ready"); setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    const guard = setTimeout(() => child.kill("SIGKILL"), 10_000);
    let ready = false;
    child.stdout.once("data", () => {
        ready = true;
        child.kill("SIGKILL");
    });
    try {
        await new Promise<void>((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", () => resolve());
        });
        expect(ready).toBe(true);
        const store = new RunStore(dbPath);
        store.acquire();
        try {
            const resumed = store.start({ query: "crash" }, null, null);
            expect(resumed.resumed).toBe(true);
            expect(resumed.progress.cursor).toBe("190");
            expect(store.pending(resumed.id)?.id).toBe("180");
        } finally {
            store.close();
        }
    } finally {
        clearTimeout(guard);
        child.kill("SIGKILL");
    }
});
