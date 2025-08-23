import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { DateTime } from "luxon";
import {
    tweetsOperations,
    getBunSqlite,
    runBunMigrations,
} from "@comifuro/core";
import { fileURLToPath } from "node:url";

const IMPORTS_FILE = "imports.json";

interface TweetData {
    user: string;
    time: string;
    text: string;
    url: string;
}

interface ImportRecord {
    dateFolder: string;
    importedAt: string;
}

/**
 * Extract tweet ID from Twitter URL
 */
function getTweetIdFromUrl(url: string): string {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] || "" : "";
}

const bunSqlitePath = process.cwd() + "/tweets.db";
const bunSqlite = getBunSqlite(bunSqlitePath);

/**
 * Generate bitmask for images 0-4 based on which image files exist
 */
async function generateImageMask(tweetDir: string): Promise<number> {
    let mask = 0;
    for (let i = 0; i < 5; i++) {
        try {
            await readFile(join(tweetDir, `image-${i}.webp`));
            mask |= 1 << i;
        } catch {
            // Image doesn't exist, bit remains 0
        }
    }
    return mask;
}

/**
 * Load previously imported date folders
 */
async function loadImportedDateFolders(): Promise<Set<string>> {
    try {
        const data = await readFile(IMPORTS_FILE, "utf-8");
        const records: ImportRecord[] = JSON.parse(data);
        return new Set(records.map((record) => record.dateFolder));
    } catch {
        return new Set();
    }
}

/**
 * Save imported date folders
 */
async function saveImportedDateFolders(dateFolders: string[]): Promise<void> {
    const existing = await loadImportedDateFolders();
    const newRecords: ImportRecord[] = dateFolders.map((dateFolder) => ({
        dateFolder,
        importedAt: new Date().toISOString(),
    }));

    const allRecords = [
        ...Array.from(existing).map((dateFolder) => ({
            dateFolder,
            importedAt: new Date().toISOString(),
        })),
        ...newRecords,
    ];

    await Bun.write(IMPORTS_FILE, JSON.stringify(allRecords, null, 2));
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
    const url = new URL("../dist/", import.meta.url);
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

        // Check if tweet already exists
        const existing = await tweetsOperations.getTweet(bunSqlite, tweetId);
        if (existing) {
            console.log(
                `Skipping ${folderPath}: Tweet ${tweetId} already exists in database`
            );
            return;
        }

        const imageMask = await generateImageMask(folderPath);
        const timestamp = isoToDate(tweetData.time);

        await tweetsOperations.insertTweet(bunSqlite, {
            id: tweetId,
            user: tweetData.user,
            timestamp,
            text: tweetData.text,
            imageMask,
        });

        console.log(`Imported tweet ${tweetId} from ${folderPath}`);
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
