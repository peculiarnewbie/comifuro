import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { DateTime } from 'luxon';
import { db } from '../drizzle/db';
import { tweets } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const IMPORTS_FILE = 'imports.json';

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
  return match ? match[1] || '' : '';
}

/**
 * Generate bitmask for images 0-4 based on which image files exist
 */
async function generateImageMask(tweetDir: string): Promise<number> {
  let mask = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await readFile(join(tweetDir, `image-${i}.webp`));
      mask |= (1 << i);
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
    const data = await readFile(IMPORTS_FILE, 'utf-8');
    const records: ImportRecord[] = JSON.parse(data);
    return new Set(records.map(record => record.dateFolder));
  } catch {
    return new Set();
  }
}

/**
 * Save imported date folders
 */
async function saveImportedDateFolders(dateFolders: string[]): Promise<void> {
  const existing = await loadImportedDateFolders();
  const newRecords: ImportRecord[] = dateFolders.map(dateFolder => ({
    dateFolder,
    importedAt: new Date().toISOString()
  }));

  const allRecords = [...Array.from(existing).map(dateFolder => ({
    dateFolder,
    importedAt: new Date().toISOString()
  })), ...newRecords];

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
  const currentDir = process.cwd();
  let checkDir = currentDir;

  // Go up directories until we find the project root
  while (true) {
    const backupPath = join(checkDir, 'backup', 'new');
    try {
      await readdir(backupPath);
      return backupPath;
    } catch {
      const parentDir = dirname(checkDir);
      if (parentDir === checkDir) {
        throw new Error('Could not find backup/new directory');
      }
      checkDir = parentDir;
    }
  }
}

/**
 * Process a single tweet folder
 */
async function processTweetFolder(folderPath: string): Promise<void> {
  const tweetJsonPath = join(folderPath, 'tweet.json');

  try {
    const tweetData: TweetData = JSON.parse(await readFile(tweetJsonPath, 'utf-8'));
    const tweetId = getTweetIdFromUrl(tweetData.url);

    if (!tweetId) {
      console.warn(`Skipping ${folderPath}: Could not extract tweet ID from URL`);
      return;
    }

    // Check if tweet already exists
    const existing = await db.select().from(tweets).where(eq(tweets.id, tweetId));
    if (existing.length > 0) {
      console.log(`Skipping ${folderPath}: Tweet ${tweetId} already exists in database`);
      return;
    }

    const imageMask = await generateImageMask(folderPath);
    const timestamp = isoToDate(tweetData.time);

    await db.insert(tweets).values({
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
    await db.select({ id: tweets.id }).from(tweets).limit(1);
    console.log('Database tables already exist');
  } catch (error) {
    console.log('Database tables not found, running migrations...');
    try {
      // Run the migration script
      const migrationProcess = Bun.spawn(['bun', 'run', 'drizzle/migrate.ts'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const exitCode = await migrationProcess.exited;
      if (exitCode !== 0) {
        const errorText = await new Response(migrationProcess.stderr).text();
        throw new Error(`Migration failed: ${errorText}`);
      }

      console.log('Migrations completed successfully');
    } catch (migrateError) {
      console.error('Migration failed:', migrateError);
      throw migrateError;
    }
  }
}

/**
 * Main import function
 */
async function importTweets() {
  try {
    console.log('Starting tweet import process...');

    // Ensure database is ready
    await ensureDatabaseReady();

    const backupDir = await findBackupDir();
    console.log(`Found backup directory: ${backupDir}`);

    const importedDateFolders = await loadImportedDateFolders();
    console.log(`Found ${importedDateFolders.size} previously imported date folders`);

    // Get all date folders
    const dateFolders = await readdir(backupDir);
    console.log(`Found ${dateFolders.length} date folders: ${dateFolders.join(', ')}`);

    let totalTweetFolders = 0;
    const newDateFolders: string[] = [];

    // Process each date folder
    for (const dateFolder of dateFolders) {
      if (importedDateFolders.has(dateFolder)) {
        console.log(`Skipping already imported date folder: ${dateFolder}`);
        continue;
      }

      const datePath = join(backupDir, dateFolder);
      try {
        const folders = await readdir(datePath);
        const tweetFolders = folders.filter(folder =>
          folder.startsWith('twitter-article-')
        );

        console.log(`Processing ${tweetFolders.length} tweet folders in ${dateFolder}`);
        totalTweetFolders += tweetFolders.length;

        for (const folder of tweetFolders) {
          const folderPath = join(datePath, folder);
          await processTweetFolder(folderPath);
        }

        newDateFolders.push(dateFolder);
      } catch (error) {
        console.error(`Error processing date folder ${dateFolder}:`, error);
        continue;
      }
    }

    console.log(`Found ${totalTweetFolders} total tweet folders across all dates`);

    if (newDateFolders.length > 0) {
      await saveImportedDateFolders(newDateFolders);
      console.log(`Successfully imported ${newDateFolders.length} new date folders`);
    } else {
      console.log('No new date folders to import');
    }

    console.log('Import process completed!');

  } catch (error) {
    console.error('Import process failed:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  importTweets();
}