import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DateTime } from "luxon";
import { tweetsOperations } from "@comifuro/core";
import { getBunSqlite } from "@comifuro/core/bunSqlite";
import { runBunMigrations } from "@comifuro/core/migrate";
import { fileURLToPath } from "node:url";
import type { TweetData, ImportRecord } from "./lib/types";
import { getTweetIdFromUrl } from "./lib/utils";
import {
    loadImportsJson,
    saveImportsJson,
    generateImageMask,
} from "./lib/fileUtils";

const dbUrl = new URL("../tweets.sqlite", import.meta.url);
const bunSqlitePath = fileURLToPath(dbUrl);
const bunSqlite = getBunSqlite(bunSqlitePath);

/**
 * Load previously imported date folders
 */
async function loadImportedDateFolders(): Promise<Set<string>> {
    const records = await loadImportsJson();
    return new Set(records.map((record) => record.dateFolder));
}

/**
 * Save imported date folders
 */
async function saveImportedDateFolders(dateFolders: string[]): Promise<void> {
    const existing = await loadImportsJson();
    const newRecords: ImportRecord[] = dateFolders.map((dateFolder) => ({
        dateFolder,
        importedAt: new Date().toISOString(),
    }));

    const allRecords = [...existing, ...newRecords];

    await saveImportsJson(allRecords);
}

/**
 * Convert ISO datetime to Date object
 */
function isoToDate(isoString: string): Date {
    const dt = DateTime.fromISO(isoString);
    return dt.toJSDate();
}

/**
 * Find the backup directory with tweet data
 */
async function findBackupDir(): Promise<string> {
    const url = new URL(`../dist/`, import.meta.url);
    return fileURLToPath(url);
}

/**
 * Process a single tweet folder
 */
async function processTweetFolder(folderPath: string): Promise<void> {
    const tweetJsonPath = join(folderPath, "tweet.json");

    try {
        const tweetData: TweetData = JSON.parse(
            await readFile(tweetJsonPath, "utf-8")
        );
        const tweetId = getTweetIdFromUrl(tweetData.url);

        if (!tweetId) {
            console.warn(
                `Skipping ${folderPath}: Could not extract tweet ID from URL`
            );
            return;
        }

        const imageMask = await generateImageMask(folderPath);
        const timestamp = isoToDate(tweetData.time);

        // Upsert tweet: insert or update existing
        await tweetsOperations.upsertTweet(bunSqlite, {
            id: tweetId,
            user: tweetData.user,
            timestamp,
            text: tweetData.text,
            imageMask,
        });

        console.log(`Upserted tweet ${tweetId} from ${folderPath}`);
    } catch (error) {
        console.error(`Error processing ${folderPath}:`, error);
    }
}

/**
 * Ensure database tables exist
 */
async function ensureDatabaseReady() {
    try {
        // Try to query the tweets table to see if it exists
        await tweetsOperations.selectTweets(bunSqlite, { limit: 1 });
        console.log("Database tables already exist");
    } catch (error) {
        console.log("Database tables not found, running migrations...");
        try {
            // Run the migration script
            runBunMigrations(bunSqlitePath);

            console.log("Migrations completed successfully");
        } catch (migrateError) {
            console.error("Migration failed:", migrateError);
            throw migrateError;
        }
    }
}

/**
 * Main import function
 */
async function importTweets() {
    try {
        console.log("Starting tweet import process...");

        // Ensure database is ready
        await ensureDatabaseReady();

        const backupDir = await findBackupDir();
        console.log(`Found backup directory: ${backupDir}`);

        const importedDateFolders = await loadImportedDateFolders();
        console.log(
            `Found ${importedDateFolders.size} previously imported date folders`
        );

        // Get all date folders
        const dateFolders = (await readdir(backupDir, { withFileTypes: true }))
            .filter((e) => e.isDirectory())
            .filter((e) => !e.name.includes("twitter-article-"))
            .map((e) => e.name);
        console.log(
            `Found ${dateFolders.length} date folders: ${dateFolders.join(", ")}`
        );

        let totalTweetFolders = 0;
        const newDateFolders: string[] = [];

        // Process each date folder
        for (const dateFolder of dateFolders) {
            if (importedDateFolders.has(dateFolder)) {
                console.log(
                    `Skipping already imported date folder: ${dateFolder}`
                );
                continue;
            }

            const datePath = join(backupDir, dateFolder);
            try {
                const folders = await readdir(datePath);
                const tweetFolders = folders.filter((folder) =>
                    folder.startsWith("twitter-article-")
                );

                console.log(
                    `Processing ${tweetFolders.length} tweet folders in ${dateFolder}`
                );
                totalTweetFolders += tweetFolders.length;

                for (const folder of tweetFolders) {
                    const folderPath = join(datePath, folder);
                    await processTweetFolder(folderPath);
                }

                newDateFolders.push(dateFolder);
            } catch (error) {
                console.error(
                    `Error processing date folder ${dateFolder}:`,
                    error
                );
                continue;
            }
        }

        console.log(
            `Found ${totalTweetFolders} total tweet folders across all dates`
        );

        if (newDateFolders.length > 0) {
            await saveImportedDateFolders(newDateFolders);
            console.log(
                `Successfully imported ${newDateFolders.length} new date folders`
            );
        } else {
            console.log("No new date folders to import");
        }

        console.log("Import process completed!");
    } catch (error) {
        console.error("Import process failed:", error);
        process.exit(1);
    }
}

if (import.meta.main) {
    importTweets();
}
