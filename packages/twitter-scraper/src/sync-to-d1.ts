import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "@comifuro/core/schema";
import type { TweetSelect } from "@comifuro/core/types";
import { desc, gt } from "drizzle-orm";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ImportRecord } from "./lib/types";
import { getTweetIdFromUrl } from "./lib/utils";
import { fileExists, loadImportsJson, saveImportsJson } from "./lib/fileUtils";
import { DateTime } from "luxon";
import { readdirSync } from "node:fs";

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

async function getD1LastTweet(): Promise<any | null> {
    const res = await fetch(`${API_BASE}/tweets/last`);
    if (!res.ok)
        throw new Error(`Failed to fetch last tweet from D1: ${res.status}`);
    return await res.json();
}

async function upsertBatch(tweets: any[]): Promise<number> {
    const res = await fetch(`${API_BASE}/tweets/upsert`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "pec-password": PASSWORD,
        },
        body: JSON.stringify(tweets),
    });
    if (!res.ok) throw new Error(`Failed to upsert batch: ${res.status}`);
    // We don't use the response data, but we need to consume it
    await res.json();
    return tweets.length;
}

/**
 * Upload a single image to the API
 */
async function uploadImage(
    tweetId: string,
    imagePath: string,
    imageNumber: number
): Promise<void> {
    const key = `${tweetId}/${imageNumber}.webp`;
    const encodedKey = encodeURIComponent(key);
    const formData = new FormData();
    formData.append("image", Bun.file(imagePath));

    console.log(`Uploading image for tweet ${tweetId} to key ${encodedKey}...`);
    const res = await fetch(`${API_BASE}/upload/${encodedKey}`, {
        method: "POST",
        headers: {
            "pec-password": PASSWORD,
        },
        body: formData,
    });
    if (!res.ok) throw new Error(`Upload failed for ${key}: ${res.status}`);
    console.log(`Upload successful for tweet ${tweetId} to key ${encodedKey}`);
}

/**
 * Process images for a specific date folder
 */
async function processDateFolderForImages(dateFolder: string): Promise<void> {
    const datePath = join(process.cwd(), "dist", dateFolder);
    try {
        const folders = await readdir(datePath);
        const tweetFolders = folders.filter((folder) =>
            folder.startsWith("twitter-article-")
        );

        console.log(
            `Processing ${tweetFolders.length} tweet folders in ${dateFolder}`
        );

        for (const folder of tweetFolders) {
            const folderPath = join(datePath, folder);
            const tweetJsonPath = join(folderPath, "tweet.json");

            if (!(await fileExists(tweetJsonPath))) {
                console.warn(`Skipping ${folder}: tweet.json not found`);
                continue;
            }

            const tweetData = JSON.parse(
                await readFile(tweetJsonPath, "utf-8")
            );
            const tweetId = getTweetIdFromUrl(tweetData.url);

            if (!tweetId) {
                console.warn(
                    `Skipping ${folder}: Could not extract tweet ID from URL`
                );
                continue;
            }

            // Upload images 0-4 if they exist
            for (let i = 0; i < 5; i++) {
                const imagePath = join(folderPath, `image-${i}.webp`);
                if (await fileExists(imagePath)) {
                    await uploadImage(tweetId, imagePath, i);
                }
            }
        }
    } catch (error) {
        console.error(`Error processing date folder ${dateFolder}:`, error);
        throw error;
    }
}

async function oldMain() {
    console.log("Starting sync to D1...");

    // Open local DB
    const sqlite = new Database(LOCAL_DB_PATH);
    const db = drizzle(sqlite, { schema: schema });

    // Fetch last tweet from D1
    const last = await getD1LastTweet();
    const lastTimestamp = last ? new Date(last.timestamp).getTime() : 0;
    console.log("D1 last timestamp:", lastTimestamp || "none");

    // Get newer local tweets
    const newer: TweetSelect[] = lastTimestamp
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
    } else {
        const transformed = newer.map((x) => {
            return {
                ...x,
                timestamp: DateTime.fromJSDate(x.timestamp).toMillis(),
            };
        });
        await upsertBatch(transformed);
        // Send in batches of 20
        // let total = 0;
        // for (let i = 0; i < newer.length; i += 20) {
        //     const chunk = newer.slice(i, i + 20).map((t: any) => ({
        //         id: t.id,
        //         user: t.user,
        //         timestamp: t.timestamp,
        //         text: t.text,
        //         imageMask: t.imageMask ?? 0,
        //     }));
        //     console.log("chunk", chunk);
        //     const count = await upsertBatch(chunk);
        //     total += count;
        //     console.log(`Upserted batch ${i / 20 + 1}: ${count} rows`);
        // }
        console.log(`Sync complete. Upserted ${newer.length} tweets.`);
    }

    // Handle image uploads for date folders that haven't had images uploaded yet
    console.log("Starting image upload process...");
    const imports = await loadImportsJson();
    const foldersToUpload = imports.filter((imp) => !imp.imagesUploadedAt);

    if (foldersToUpload.length === 0) {
        console.log("No folders need image uploads.");
        return;
    }

    console.log("folderToUploads", foldersToUpload);

    console.log(
        `Found ${foldersToUpload.length} folders that need image uploads`
    );

    for (const imp of foldersToUpload) {
        console.log(`Processing images for date folder: ${imp.dateFolder}`);
        try {
            await processDateFolderForImages(imp.dateFolder);
            imp.imagesUploadedAt = new Date().toISOString();
            console.log(`Completed image uploads for ${imp.dateFolder}`);
        } catch (error) {
            console.error(
                `Failed to upload images for ${imp.dateFolder}:`,
                error
            );
            // Continue with other folders even if one fails
        }
    }

    // Save updated imports.json
    await saveImportsJson(imports);
    console.log(
        `Image upload process complete. Updated ${foldersToUpload.length} folders.`
    );
}

async function main() {
    // Open local DB
    const sqlite = new Database(LOCAL_DB_PATH);
    const db = drizzle(sqlite, { schema: schema });

    const tweets = (await db.select().from(schema.tweets)) as TweetSelect[];

    const distDir = resolve(import.meta.dir, "../dist/");

    const failed = [];
    const newlyUploded = [];
    for (const tweet of tweets) {
        try {
            console.log("uploading images tweet", tweet.id);
            const tweetDir = resolve(distDir, tweet.id);
            const files = readdirSync(tweetDir);
            if (files.includes("uploaded")) continue;
            console.log("files", files);
            const images = files.filter((f) => f.startsWith("image-"));
            if (images.length === 0) continue;
            for (const image of images) {
                const imagePath = resolve(tweetDir, image);
                const imageNumber = parseInt(image.replace("image-", ""));
                console.log("uploading image", imageNumber);
                await uploadImage(tweet.id, imagePath, imageNumber);
            }
            await Bun.write(resolve(tweetDir, "uploaded"), "");
            newlyUploded.push(tweet);
        } catch (e) {
            console.error("failed to upload images", e);
            failed.push(tweet);
        }
    }

    const transformed = newlyUploded.map((x) => {
        return {
            ...x,
            timestamp: DateTime.fromJSDate(x.timestamp).toMillis(),
        };
    });

    console.log("upserting", transformed.length, "tweets");
    await upsertBatch(transformed);

    console.log("failed", failed);
    await Bun.write(
        resolve(distDir, `./${DateTime.now().toMillis()}-failed.json`),
        JSON.stringify(failed, null, 4)
    );
}

if (import.meta.main) {
    main().catch((e) => {
        console.error("Sync failed:", e);
        process.exit(1);
    });
}
