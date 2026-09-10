# Backend and scraper audit

Scope: scraper lifecycle, checkpoint correctness, browser extraction, classifier/media handling, persistence, API validation, and development checks. Frontend components, routes, and styling were excluded.

## Findings addressed

| Finding                                                                                                               | Result                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fresh default runs required an existing checkpoint and did no work without one                                        | Fresh runs discover and queue results normally                                                                      |
| The old cursor tracked the first tweet instead of durable progress; failures could be skipped by the final checkpoint | Local task queue, persisted page cursor, explicit scan boundary, and no checkpoint commit with unfinished tasks     |
| Backfills had no durable resume information and could overwrite the incremental watermark                             | Independent resumable backfill scopes; backfill checkpoint writes prohibited                                        |
| Changing search terms reused unrelated checkpoint state                                                               | Event/query/date fingerprints isolate remote state; unsafe legacy state is not imported                             |
| Failures were logged and swallowed, including image loss and incomplete threads                                       | Stored errors, stage recovery, failure isolation, three-consecutive-failure cutoff, and meaningful exit codes       |
| Requests could hang indefinitely, retry immediately, or ignore rate limits                                            | Response-body deadlines, three-attempt maximum, exponential waits, Retry-After, durable cooldowns, and cancellation |
| A restart could immediately repeat a throttled request                                                                | Shared journal cooldown applies before startup network activity and across run scopes                               |
| Successful classification was repeated after a thread failure                                                         | Root results, thread snapshots, and continuation completion are journaled                                           |
| Classifier images were downloaded twice, and failed downloads could silently remove classification evidence           | Reuse downloaded buffers; propagate failures; bounded image bytes/pixels                                            |
| X virtualized away earlier thread tweets, losing parts of the chain                                                   | Accumulate thread observations across scrolls; bounded traversal                                                    |
| Empty/error/login pages could look like search exhaustion                                                             | Distinguish explicit no-results from stalled, unavailable, login, and throttled pages                               |
| Unbounded search traversal accumulated IDs in memory                                                                  | Page/scroll budgets plus SQLite task deduplication                                                                  |
| SIGINT/SIGTERM exited without finishing cleanup                                                                       | Abortable requests, durable stop status, managed-process cleanup, CDP disconnect                                    |
| Managed opencode output pipes could fill and freeze the server; health checks could hang                              | Drain pipes, deadline-bound health checks, capture spawn errors, and terminate failed startup                       |
| Scraper upserts deleted existing media on a weaker retry                                                              | Merge media by index and combine image masks with bitwise OR                                                        |
| Weaker classifications could erase stronger inferred metadata                                                         | Preserve metadata when an incoming classification is weaker                                                         |
| D1 writes used unsupported interactive transactions                                                                   | Atomic D1 batches for scraper writes, item replacement, rerooting, and booth rebuilds; synchronous Bun transactions |
| Repeated rank expressions exceeded D1's statement parameter limit                                                     | Use fixed schema constants in classification expressions                                                            |
| Item replacement erased catalogues from other tweets by the same author                                               | Replace only the source tweet's items atomically                                                                    |
| Missing thread metadata cleared known booth/preorder information                                                      | Missing incoming values preserve known user metadata                                                                |
| Missing server and request passwords compared equal                                                                   | Password authentication fails closed when either value is absent                                                    |
| Malformed IDs, dates, masks, media indices, and limits passed validation                                              | Validate scraper CLI/config and ingestion boundaries                                                                |
| Scraper/core were omitted from recursive type checking; frozen install had inconsistent Vite aliases                  | Add package checks, declare required types, align toolchain aliases, and add reproducible backend/browser checks    |
| No usable run history beyond console summaries                                                                        | SQLite runs/attempts/tasks/stages, status CLI, 30-second heartbeat, optional OpenTelemetry spans                    |

## Validation approach

The regression suite uses real SQLite for recovery, local HTTP servers for network behavior, Miniflare D1 for persistence and rollback, and Chromium with intercepted local page fixtures for browser extraction. It exercises failed uploads, lost response bodies, interrupted processing, scope changes, reordered results, page limits, and safe retries.

No live X scrape or production deployment is part of verification. Browser fixtures cannot establish compatibility with every current X layout or account state. A production smoke run should use a small page budget and inspect its status before a longer run.

## Operational limits and follow-up decisions

- **Local ownership:** the journal lock is local. Multiple machines or separate journal files do not coordinate ownership of D1 state. A distributed lease would be needed for that operating model.
- **Discovery completeness:** X search is an external, potentially incomplete index. DOM ordering and same-author thread continuity remain heuristics; they do not prove a complete historical archive or a reply relationship. Login/challenge changes require operator attention. Thread traversal remains capped at 24 image continuations.
- **Moderation provenance:** the existing data model does not distinguish a manual classification decision from a scraper classification. Catalogue ranking is preserved, but durable manual-review overrides would require an explicit review/provenance field and migration.
- **Metadata chronology:** author booth and preorder metadata can still be replaced by older, non-null values during backfills. Missing values are now safe; choosing the authoritative source among conflicting catalogues requires a product rule and provenance.
- **Manual deletion semantics:** automatic ingestion is additive for media; intentional media removal must use an explicit administrative operation. Removing inferred metadata similarly needs an explicit operation rather than treating absent scraper evidence as deletion.
- **Cross-service atomicity:** R2 uploads, D1 writes, derived metadata, and public-feed export cannot commit as one transaction. Deterministic keys, idempotent writes, stored stages, and dirty-feed tracking make retries safe, but interrupted uploads can leave unreferenced R2 objects. A future reconciliation/retention tool could remove them.
- **Retention and migration:** history is kept indefinitely on disk. Back up the journal, monitor free space, and preserve it when moving the scraper. Interrupted classifier session creation can also leave sessions on an externally managed opencode server.
- **Legacy gaps:** previously skipped tweets cannot be reconstructed from old summary rows. New query-scoped checkpoints intentionally start fresh; set a `--since` window for the desired recovery coverage.

The standalone thumbnail backfill remains a separate maintenance tool. Its API operations now inherit HTTP deadlines/backoff, but it does not share the search run journal or its stage recovery.
