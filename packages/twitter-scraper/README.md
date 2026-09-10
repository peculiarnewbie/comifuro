# Twitter catalogue scraper

A serial Playwright scraper with a durable local work queue, resumable searches, and conservative request pacing. Tweet/media data goes to the existing Worker API, D1, and R2. No frontend changes are required.

## Setup

Use Node **22.16+** (Node 24 recommended), pnpm, and an authenticated Chromium browser. Bun is needed for the existing unit tests, not for running the scraper.

```bash
pnpm install --frozen-lockfile
helium-browser --remote-debugging-port=9222
```

Log into X and leave an X tab open. The scraper attaches over CDP. It can also start the command in `SCRAPER_BROWSER_COMMAND` when CDP is unavailable. It starts a local opencode server by default, or reuses a healthy one.

Put configuration in `packages/twitter-scraper/.env` or export it in the shell:

```dotenv
API_BASE_URL=https://cf.peculiarnewbie.com/api
API_PASSWORD=...
EVENT_ID=cf22
SEARCH_QUERY='(#comifuro22catalogue OR #cf22) filter:images'
SCRAPER_STATE_ID=x-search:cf22
BROWSER_CDP_URL=http://127.0.0.1:9222
SCRAPER_PAGE_URL_MATCH=https://x.com/
OPENCODE_BASE_URL=http://127.0.0.1:4097
OPENCODE_MANAGED=true
# OPENCODE_PROVIDER_ID=...
# OPENCODE_MODEL_ID=...
```

`PEC_PASSWORD` is an API password fallback. `STAGEHAND_CDP_URL` remains a CDP URL alias. For a password-protected opencode server, set `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`. Set `OPENCODE_MANAGED=false` for a server you manage yourself. Automatic server startup is restricted to loopback addresses.

When changing `EVENT_ID`, explicitly set `SEARCH_QUERY`. The classifier prompt defaults to [prompts/catalogue-classifier.md](prompts/catalogue-classifier.md); override it with `CLASSIFIER_PROMPT_PATH`. The prompt supports `{{tweet_text}}`, `{{matched_tags}}`, and `{{search_query}}`.

## Run and resume

From the repository root:

```bash
# Newest tweets down to the last completed checkpoint, or resume unfinished work.
pnpm scrape

# Backfill, resuming automatically when the same command is repeated.
pnpm scrape:max-id --max-id=2039968911693861364 --since=2026-01-01 --max-pages=100

# Local status: no API password, browser, or classifier needed.
pnpm scrape:status
```

Repeat the **same command and configuration** to resume. The journal matches runs by API, event, search query/date, mode, initial max ID, state setting, and classifier prompt/provider/model fingerprint. Changing the page limit or pacing does not abandon a run.

Supported options:

| Option                           | Meaning                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `--mode=default`                 | Incremental search; also handles an empty initial state |
| `--mode=max-id`                  | Historical backfill with search reloads                 |
| `--max-id` / `--max_id`          | Positive decimal ID; requires max-id mode               |
| `--since` / `--since:YYYY-MM-DD` | Valid inclusive lower date boundary                     |
| `--max-pages`                    | Positive page/reload budget per invocation; default 100 |
| `--no-update-state`              | Do not commit a remote incremental checkpoint           |
| `--update-state`                 | Enable remote checkpoint commits in default mode        |
| `--status`                       | Show the latest 20 local runs and their pending work    |

Backfills **never update the incremental checkpoint**. Combining max-id mode with `--update-state` is rejected. A page limit is a resumable pause, not successful completion.

Exit codes: `0` completed, `2` paused (page budget, stalled timeline, or unresolved tweets), `1` failed, `130` SIGINT, `143` SIGTERM. Ctrl-C aborts requests, records the stop, and disconnects CDP. The attached user browser remains open. A hard kill can leave the last attempt marked running; the next invocation recovers it and records that attempt as interrupted.

## What survives a restart

The default journal is `packages/twitter-scraper/.scraper/runs.sqlite`, independent of the working directory. Override it with `SCRAPER_RUN_DB` (prefer an absolute path). SQLite uses WAL and full synchronization.

- Discovered search tweets are queued before processing. Failed payloads remain available even if X no longer displays them.
- Completed root classifications, discovered thread chains, and completed continuation uploads are saved as stages. A retry continues from the last acknowledged stage.
- A search cursor advances only after all visible tweets are durably queued and attempted. Unresolved tweets stay in the queue even as discovery continues.
- The incremental high-water mark advances only after reaching the old checkpoint, the date boundary, or explicit “No results”, and successfully handling every queued tweet and the feed export.
- Ambiguous emptiness, authentication problems, unavailable timelines, and stalled cursors retain the checkpoint.
- Search reloads use the oldest observed eligible ID minus one, with decimal/BigInt arithmetic.
- An interrupted API response may hide a successful write. Retries therefore use deterministic media keys and idempotent database merges. The public feed remains marked dirty until export succeeds.

Checkpoint keys in D1 now include an event/query/date fingerprint. **The first run after this upgrade starts a fresh scoped checkpoint**; old state rows remain untouched. This avoids trusting unsafe legacy checkpoints or skipping older matches after changing search terms. Use `--since` to set the intended coverage window.

The local journal is required for mid-run recovery. Keep it on persistent local disk. To move it to another machine, stop the scraper and copy the journal with any `-wal` and `-shm` sidecars. The journal contains public tweet text and run metadata, not configured API passwords. No automatic retention deletes historical records.

A local process lock prevents concurrent writers sharing the journal. A dead local PID can be reclaimed automatically. An active PID, reused PID, or lock from another hostname is refused. Do not run independent machines/journals against the same remote state simultaneously; there is no distributed lease.

## Long runs and rate limits

Everything remains serial. There is no concurrency or throughput increase.

| Setting                        | Default                                        |
| ------------------------------ | ---------------------------------------------- |
| `SCRAPER_SCROLL_DELAY_MS`      | 3,000 ms, also between processed search tweets |
| `SCRAPER_PAGE_DELAY_MS`        | 15,000 ms before every search reload           |
| `SCRAPER_IDLE_SCROLL_LIMIT`    | 4 idle scrolls                                 |
| `SCRAPER_MAX_SCROLLS_PER_PAGE` | 100, bounding page memory and forcing a reload |
| `SCRAPER_MAX_ID_RELOAD_LIMIT`  | 100 pages per invocation                       |
| `THREAD_SCROLL_DELAY_MS`       | 1,500 ms                                       |
| `THREAD_IDLE_SCROLL_LIMIT`     | 2                                              |

All delays and limits must be positive integers. Thread discovery is bounded to 100 scrolls and 24 image continuations, retaining previously seen tweets across DOM virtualization.

HTTP operations allow at most three attempts, with 30/60-second exponential waits plus jitter. They respect `Retry-After`; HTTP 429 imposes **at least 15 minutes**. The last cooldown is saved even when retries are exhausted, and is honored across restarts and search scopes in the same journal. X browser rate-limit responses and visible rate-limit notices also pause requests. Authentication and challenge pages require operator attention rather than automatic bypass.

Requests include response-body deadlines: 60 seconds for API/images and 180 seconds for classifier calls. Image downloads are limited to 25 MiB and must have an image content type. Downloaded image buffers are reused for classification, avoiding duplicate X image downloads. Only unavailable image-size variants (400/404) fall back to another size; rate limits do not trigger a burst of fallback requests.

Individual tweet failures are retained while other results continue. Three consecutive failures stop the run. Authentication failures, rate limits, interrupted requests, and unavailable browser pages stop or cool down immediately. Once the service problem is fixed, repeat the original command.

## Inspecting a run

`pnpm scrape:status` reports run ID, status, timestamps, stop reason, query scope, newest ID, next search cursor, page/processed/accepted counts, cooldown deadline, pending count, next unfinished tweet, and first failure.

The SQLite tables retain more detail:

- `runs`: current progress and scope for each logical scan.
- `attempts`: each invocation, its start/end times, status, and ending summary.
- `tasks`: discovered payloads, attempt counts, completed/failed status, accepted count, and latest error.
- `artifacts`: acknowledged root and thread stages used during retries.

Processed counts refer to completed search tasks. Accepted counts include their accepted thread replies; they are processing outcomes, not a claim that every row was newly inserted into D1. Writes interrupted before acknowledgement can be safely replayed.

JSON progress output includes run/attempt IDs and a heartbeat every 30 seconds. Optional OpenTelemetry spans cover runs, tweets, and HTTP attempts. Set `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to export via OTLP HTTP; authentication headers can use standard OTLP environment settings. Tracing is disabled when no endpoint is configured, and the SQLite journal works independently.

## Verification

```bash
pnpm typecheck
pnpm test:backend
pnpm check

# Optional browser integration tests; all page/image traffic is fulfilled locally.
pnpm --filter twitter-scraper exec playwright install chromium
pnpm test:browser
```

`pnpm test:backend` uses real SQLite, local HTTP services, and local D1 through Miniflare. Tests cover resumed queues, failure isolation, page limits, out-of-order tweets, cancellation, backoff, stuck response bodies, media preservation, atomic rollback, and related metadata writes. The browser suite checks virtualized thread collection and distinguishing site errors from tweet text. It does not use a live X account.

The Worker changes must be deployed before relying on corrected D1/media behavior. They require no D1 schema migration. Review [AUDIT.md](AUDIT.md) for findings and remaining limits.
