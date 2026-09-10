import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hostname } from "node:os";
import { DatabaseSync } from "node:sqlite";
import * as Schema from "effect/Schema";
import { ExtractedTweetSchema, type ExtractedTweet } from "./types";

const Id = Schema.NullOr(Schema.String);
const Progress = Schema.Struct({
    checkpoint: Id,
    cursor: Id,
    newest: Id,
    pages: Schema.Number,
    processed: Schema.Number,
    accepted: Schema.Number,
    exportPending: Schema.Boolean,
    boundaryReached: Schema.Boolean,
    notBefore: Schema.Number,
});
export type RunProgress = {
    -readonly [K in keyof Schema.Schema.Type<typeof Progress>]: Schema.Schema.Type<
        typeof Progress
    >[K];
};

export type TaskJournal = {
    read(key: string): unknown;
    write(key: string, value: unknown): void;
};

/** Local durable work queue. Transactions never span network operations. */
export class RunStore {
    private readonly db: DatabaseSync;
    private readonly owner = randomUUID();
    private locked = false;

    constructor(readonly path: string) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
        if (version > 1) {
            this.db.close();
            throw new Error("Scraper journal was created by a newer version");
        }
        this.db.exec(`
            PRAGMA user_version = 1;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS scraper_lock (
                id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL,
                pid INTEGER NOT NULL, host TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY, scope TEXT NOT NULL, description TEXT NOT NULL,
                status TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                stop_reason TEXT, progress TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS runs_scope ON runs(scope, started_at);
            CREATE TABLE IF NOT EXISTS tasks (
                run_id TEXT NOT NULL, tweet_id TEXT NOT NULL, payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                accepted INTEGER NOT NULL DEFAULT 0, error TEXT,
                PRIMARY KEY (run_id, tweet_id)
            );
            CREATE TABLE IF NOT EXISTS artifacts (
                run_id TEXT NOT NULL, tweet_id TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY (run_id, tweet_id, key)
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id TEXT PRIMARY KEY, run_id TEXT NOT NULL, started_at TEXT NOT NULL,
                ended_at TEXT, status TEXT NOT NULL, summary TEXT
            );
        `);
    }

    private transaction<T>(fn: () => T): T {
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const result = fn();
            this.db.exec("COMMIT");
            return result;
        } catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }

    acquire() {
        this.transaction(() => {
            const lock = this.db.prepare("SELECT * FROM scraper_lock WHERE id = 1").get();
            if (lock) {
                let alive = true;
                if (lock.host === hostname() && typeof lock.pid === "number") {
                    try {
                        process.kill(lock.pid, 0);
                    } catch (error) {
                        if (error instanceof Error && "code" in error && error.code === "ESRCH") {
                            alive = false;
                        }
                    }
                }
                if (alive)
                    throw new Error(
                        `Scraper journal is in use by PID ${String(lock.pid)} on ${String(lock.host)}`,
                    );
            }
            this.db
                .prepare("INSERT OR REPLACE INTO scraper_lock VALUES (1, ?, ?, ?)")
                .run(this.owner, process.pid, hostname());
            this.locked = true;
        });
    }

    start(
        description: Record<string, string | boolean | null>,
        checkpoint: string | null,
        cursor: string | null,
    ) {
        const serialized = JSON.stringify(description);
        const scope = createHash("sha256").update(serialized).digest("hex");
        const row = this.db
            .prepare(
                "SELECT * FROM runs WHERE scope = ? AND status != 'completed' ORDER BY started_at DESC LIMIT 1",
            )
            .get(scope);
        const now = new Date().toISOString();
        const id = row ? String(row.id) : randomUUID();
        const progress: RunProgress = row
            ? Schema.decodeUnknownSync(Progress)(JSON.parse(String(row.progress)))
            : {
                  checkpoint,
                  cursor,
                  newest: null,
                  pages: 0,
                  processed: 0,
                  accepted: 0,
                  exportPending: false,
                  boundaryReached: false,
                  notBefore: 0,
              };
        this.transaction(() => {
            this.db
                .prepare(
                    "UPDATE tasks SET status = 'pending' WHERE run_id = ? AND status = 'failed'",
                )
                .run(id);
            this.db
                .prepare(
                    "UPDATE attempts SET status = 'interrupted', ended_at = ? WHERE run_id = ? AND status = 'running'",
                )
                .run(now, id);
            this.db
                .prepare(
                    "INSERT INTO runs VALUES (?, ?, ?, 'running', ?, ?, NULL, ?) ON CONFLICT(id) DO UPDATE SET status = 'running', updated_at = excluded.updated_at, stop_reason = NULL",
                )
                .run(id, scope, serialized, now, now, JSON.stringify(progress));
        });
        const attemptId = randomUUID();
        this.db
            .prepare("INSERT INTO attempts VALUES (?, ?, ?, NULL, 'running', NULL)")
            .run(attemptId, id, now);
        return { id, attemptId, progress, resumed: Boolean(row) };
    }

    save(id: string, progress: RunProgress) {
        this.db
            .prepare("UPDATE runs SET progress = ?, updated_at = ? WHERE id = ?")
            .run(JSON.stringify(progress), new Date().toISOString(), id);
    }

    enqueue(id: string, tweets: ExtractedTweet[], progress?: RunProgress) {
        this.transaction(() => {
            const insert = this.db.prepare(
                "INSERT OR IGNORE INTO tasks (run_id, tweet_id, payload) VALUES (?, ?, ?)",
            );
            for (const tweet of tweets) insert.run(id, tweet.id, JSON.stringify(tweet));
            if (progress) this.save(id, progress);
        });
    }

    pending(id: string): ExtractedTweet | null {
        const row = this.db
            .prepare(
                "SELECT payload FROM tasks WHERE run_id = ? AND status = 'pending' ORDER BY rowid LIMIT 1",
            )
            .get(id);
        return row
            ? Schema.decodeUnknownSync(ExtractedTweetSchema)(JSON.parse(String(row.payload)))
            : null;
    }

    unfinishedCount(id: string) {
        return Number(
            this.db
                .prepare(
                    "SELECT count(*) AS count FROM tasks WHERE run_id = ? AND status != 'done'",
                )
                .get(id)?.count ?? 0,
        );
    }

    beginTask(id: string, tweetId: string) {
        this.db
            .prepare(
                "UPDATE tasks SET attempts = attempts + 1, error = NULL WHERE run_id = ? AND tweet_id = ?",
            )
            .run(id, tweetId);
    }

    completeTask(id: string, tweetId: string, accepted: number, progress: RunProgress) {
        this.transaction(() => {
            this.db
                .prepare(
                    "UPDATE tasks SET status = 'done', accepted = ?, error = NULL WHERE run_id = ? AND tweet_id = ?",
                )
                .run(accepted, id, tweetId);
            this.save(id, progress);
        });
    }

    failTask(id: string, tweetId: string, error: string) {
        this.db
            .prepare(
                "UPDATE tasks SET status = 'failed', error = ? WHERE run_id = ? AND tweet_id = ?",
            )
            .run(error, id, tweetId);
    }

    finish(
        run: { id: string; attemptId: string; progress: RunProgress },
        status: "paused" | "failed" | "completed",
        reason: string,
    ) {
        this.transaction(() => {
            this.save(run.id, run.progress);
            const now = new Date().toISOString();
            this.db
                .prepare("UPDATE runs SET status = ?, stop_reason = ?, updated_at = ? WHERE id = ?")
                .run(status, reason, now, run.id);
            this.db
                .prepare("UPDATE attempts SET status = ?, ended_at = ?, summary = ? WHERE id = ?")
                .run(status, now, JSON.stringify({ reason, ...run.progress }), run.attemptId);
        });
    }

    taskJournal(id: string, tweetId: string): TaskJournal {
        return {
            read: (key) => {
                const row = this.db
                    .prepare(
                        "SELECT payload FROM artifacts WHERE run_id = ? AND tweet_id = ? AND key = ?",
                    )
                    .get(id, tweetId, key);
                return row ? JSON.parse(String(row.payload)) : undefined;
            },
            write: (key, value) => {
                this.db
                    .prepare("INSERT OR REPLACE INTO artifacts VALUES (?, ?, ?, ?)")
                    .run(id, tweetId, key, JSON.stringify(value));
            },
        };
    }

    recordCooldown(until: number) {
        this.db
            .prepare(
                "INSERT INTO settings VALUES ('not_before', ?) ON CONFLICT(key) DO UPDATE SET value = max(value, excluded.value)",
            )
            .run(until);
    }

    cooldownDeadline(): number {
        return Math.max(
            Number(
                this.db
                    .prepare(
                        "SELECT max(json_extract(progress, '$.notBefore')) AS deadline FROM runs",
                    )
                    .get()?.deadline ?? 0,
            ),
            Number(
                this.db.prepare("SELECT value FROM settings WHERE key = 'not_before'").get()
                    ?.value ?? 0,
            ),
        );
    }

    status() {
        return this.db
            .prepare(`SELECT runs.*, (SELECT count(*) FROM tasks WHERE run_id = runs.id AND status != 'done') AS pending,
            (SELECT tweet_id FROM tasks WHERE run_id = runs.id AND status != 'done' ORDER BY rowid LIMIT 1) AS next_tweet_id,
            (SELECT error FROM tasks WHERE run_id = runs.id AND status = 'failed' ORDER BY rowid LIMIT 1) AS last_error
            FROM runs ORDER BY started_at DESC LIMIT 20`)
            .all()
            .map((row) => ({
                id: String(row.id),
                status: String(row.status),
                startedAt: String(row.started_at),
                updatedAt: String(row.updated_at),
                stopReason: row.stop_reason,
                pending: Number(row.pending),
                nextTweetId: row.next_tweet_id,
                lastError: row.last_error,
                description: JSON.parse(String(row.description)) as unknown,
                progress: Schema.decodeUnknownSync(Progress)(JSON.parse(String(row.progress))),
            }));
    }

    close() {
        if (this.locked)
            this.db.prepare("DELETE FROM scraper_lock WHERE owner = ?").run(this.owner);
        this.db.close();
    }
}
