import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import type { tweetsTypes } from "@comifuro/core/index";
import * as schema from "@comifuro/core/schema";
import { desc, gt } from "drizzle-orm";

const LOCAL_DB_PATH = process.cwd() + "/tweets.sqlite";
const API_BASE = process.env.D1_API_BASE || ""; // e.g. https://api-comifuro.your.workers.dev
const PASSWORD = process.env.PEC_PASSWORD || process.env.PASSWORD || "";

if (!API_BASE) {
    console.error("D1_API_BASE env is required");
    process.exit(1);
}
if (!PASSWORD) {
    console.error("PEC_PASSWORD or PASSWORD env is required");
    process.exit(1);
}

async function getD1LastTweet(): Promise<tweetsTypes.TweetSelect | null> {
    const res = await fetch(`${API_BASE}/tweets/last`);
    if (!res.ok)
        throw new Error(`Failed to fetch last tweet from D1: ${res.status}`);
    const data = await res.json();
    return data;
}

async function upsertBatch(tweets: tweetsTypes.TweetInsert[]): Promise<number> {
    const res = await fetch(`${API_BASE}/tweets/upsert`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "pec-password": PASSWORD,
        },
        body: JSON.stringify(tweets),
    });
    if (!res.ok) throw new Error(`Failed to upsert batch: ${res.status}`);
    const data = await res.json();
    return tweets.length;
}

async function main() {
    console.log("Starting sync to D1...");

    // Open local DB
    const sqlite = new Database(LOCAL_DB_PATH);
    const db = drizzle(sqlite, { schema: schema });

    // Fetch last tweet from D1
    const last = await getD1LastTweet();
    const lastTimestamp = last ? new Date(last.timestamp).getTime() : 0;
    console.log("D1 last timestamp:", lastTimestamp || "none");

    // Get newer local tweets
    const newer = lastTimestamp
        ? await db
              .select()
              .from(schema.tweets)
              .where(gt(schema.tweets.timestamp, new Date(lastTimestamp)))
              .orderBy(desc(schema.tweets.timestamp))
        : await db
              .select()
              .from(schema.tweets)
              .orderBy(desc(schema.tweets.timestamp));

    console.log(`Found ${newer.length} tweets to sync`);
    if (newer.length === 0) {
        console.log("Nothing to sync.");
        return;
    }

    // Send in batches of 20
    let total = 0;
    for (let i = 0; i < newer.length; i += 20) {
        const chunk = newer.slice(i, i + 20).map((t) => ({
            id: t.id,
            user: t.user,
            timestamp: t.timestamp,
            text: t.text,
            imageMask: t.imageMask ?? 0,
        }));
        const count = await upsertBatch(chunk);
        total += count;
        console.log(`Upserted batch ${i / 20 + 1}: ${count} rows`);
    }

    console.log(`Sync complete. Upserted ${total} tweets.`);
}

if (import.meta.main) {
    main().catch((e) => {
        console.error("Sync failed:", e);
        process.exit(1);
    });
}
