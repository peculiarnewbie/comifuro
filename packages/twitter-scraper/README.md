# twitter-scraper

Stagehand-based X scraper for Comifuro catalogue tweets.

## What Changed

- No local `dist/` pipeline
- No local sqlite sync step
- No image download tab juggling
- Direct upload to the API Worker and R2
- Tweet/media/state persisted in D1
- Tweet text classified through a local opencode server before images are kept

## Requirements

1. Start a Chromium-based browser with remote debugging enabled, for example:

```bash
helium-browser --remote-debugging-port=9222
```

2. Log into X in that browser.
3. Leave an X tab open. The scraper attaches to an existing tab and reuses it.
   If you want the scraper to launch the browser for you when CDP is unavailable, set `SCRAPER_BROWSER_COMMAND`.
4. Start opencode in server mode:
This is optional now. By default the scraper will start its own dedicated `opencode serve` on port `4097` if nothing is already listening there.

## Environment

```bash
API_BASE_URL=https://cf.peculiarnewbie.com/api
API_PASSWORD=...
STAGEHAND_CDP_URL=http://127.0.0.1:9222
SCRAPER_BROWSER_COMMAND='helium-browser --remote-debugging-port=9222'
SEARCH_QUERY='(#comifuro22catalogue OR #cf22) filter:images'
SCRAPER_STATE_ID=x-search:cf22
SCRAPER_PAGE_URL_MATCH=https://x.com/
OPENCODE_BASE_URL=http://127.0.0.1:4097
OPENCODE_MANAGED=true
OPENCODE_BIN=opencode
OPENCODE_PROVIDER_ID=...
OPENCODE_MODEL_ID=...
CLASSIFIER_PROMPT_PATH=./prompts/catalogue-classifier.md
```

If your opencode server is password-protected:

```bash
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=...
```

## Prompt Tuning

Edit [prompts/catalogue-classifier.md](/home/bolt/git/other/comifuro/packages/twitter-scraper/prompts/catalogue-classifier.md).

Available placeholders:

- `{{tweet_text}}`
- `{{matched_tags}}`
- `{{search_query}}`

## Run

```bash
pnpm run scrape
```

The scraper:

- launches your configured browser command if `STAGEHAND_CDP_URL` is not already reachable
- opens the live search for the configured query
- walks visible tweets from newest to older
- stops once it reaches the last seen tweet id stored in D1
- classifies each tweet through opencode
- downloads the full-size image variant from `pbs.twimg.com`
- converts uploads to WebP and sends them to the Worker
- stores tweet/media metadata in D1
- rebuilds the public `tweets.json` feed in R2 if new accepted tweets were found

Backfill mode with explicit `max_id` reloads:

```bash
pnpm run scrape:max-id -- --max-id=2039968911693861364 --since=2026-01-01
```

In `max-id` mode the scraper:

- opens search with your base query plus `since:` and `max_id:` operators
- scrolls until the page stops yielding older tweets
- reloads search with `max_id` set to the oldest tweet seen on that page
- keeps deduping tweet ids across page reloads
- does not update `SCRAPER_STATE_ID` unless you add `--update-state`

Supported CLI flags:

- `--max-id` or `--max_id`
- `--since` or `--since:YYYY-MM-DD`
- `--max-pages`
- `--update-state` / `--no-update-state`

## Managed Opencode

Default behavior:

- if `OPENCODE_BASE_URL` is already healthy, the scraper reuses it
- otherwise, if `OPENCODE_MANAGED=true`, the scraper starts `opencode serve` itself
- the managed instance is shut down when the scraper exits

If you want to bring your own opencode server instead:

```bash
OPENCODE_MANAGED=false
OPENCODE_BASE_URL=http://127.0.0.1:4096
```
