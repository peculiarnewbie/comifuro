# Twitter Scraper Database Import

This package now includes a SQLite database system for storing scraped tweet data using Drizzle ORM.

## Database Schema

The `tweets` table contains:
- `id`: Tweet ID (extracted from URL)
- `user`: Twitter username
- `timestamp`: Date object with millisecond precision
- `text`: Tweet content
- `image_mask`: 5-bit bitmask for images 0-4

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Generate and run migrations (or let the import script handle it automatically):
   ```bash
   bun run db:generate
   bun run db:migrate
   ```

   **Note**: The import script will automatically create the database and run migrations if they don't exist, so you can skip this step if you're running the import for the first time.

## Import Tweet Data

Run the import script to process tweet data from the `backup/new` folder structure:

```bash
bun run import-tweets
```

The script will automatically scan all date folders (e.g., `2025-08-09/`, `2025-08-14/`) and process all tweet folders within them.

### Features

- **Incremental Processing**: Only processes new tweet folders that haven't been imported
- **Duplicate Prevention**: Skips tweets that already exist in the database
- **Image Bitmask**: Automatically detects which images (0-4) are present
- **Error Handling**: Continues processing even if individual tweets fail
- **Progress Tracking**: Maintains `imports.json` to track processed folders

### Import Tracking

The system uses `imports.json` to track which date folders have been processed:

```json
[
  {
    "dateFolder": "2025-08-09",
    "importedAt": "2025-01-15T10:30:00.000Z"
  }
]
```

This approach tracks entire scraping sessions rather than individual tweets, making it more efficient and preventing reprocessing of complete date folders.

## Usage

1. Run your Twitter scraper to generate data in the `backup/new` folder structure
2. Run `bun run import-tweets` to import the data
3. The script will automatically scan all date folders and skip already processed folders
4. Query the database using Drizzle ORM

## Example Query

```typescript
import { db } from './drizzle/db';
import { tweets } from './drizzle/schema';
import { eq } from 'drizzle-orm';

// Get all tweets
const allTweets = await db.select().from(tweets);

// Get tweets by user
const userTweets = await db.select().from(tweets).where(eq(tweets.user, 'username'));

// Get tweets with images (any image present)
const tweetsWithImages = await db.select().from(tweets).where(sql`${tweets.imageMask} > 0`);
```