import * as Schema from "effect/Schema";
import { marksOperations } from "@comifuro/core";
import { MarkValues } from "@comifuro/core/schema";
import { getDb, requireAccount } from "../auth";
import { InternalError } from "../errors";
import { Result, handleResult } from "../responder";
import type { AppContext } from "../types";

const Mark = Schema.Struct({
    tweetId: Schema.String,
    mark: Schema.Literals(MarkValues),
});

const MarksBody = Schema.Struct({
    marks: Schema.Array(Mark),
});

export async function getMarks(c: AppContext) {
    const accountResult = requireAccount(c);
    if (Result.isError(accountResult)) {
        return handleResult(c, accountResult, () => {
            throw new Error("unreachable");
        });
    }

    const userId = c.get("userId")!;
    const version = Number(c.req.query("version") ?? "0");

    try {
        const marks = await marksOperations.getUserMarks(getDb(c), userId, version);

        c.header("Cache-Control", "no-store");
        return c.json({
            marks: marks.map((m) => ({
                tweetId: m.tweetId,
                mark: m.mark,
                version: m.lastModifiedVersion,
            })),
            serverTime: Date.now(),
        });
    } catch (error) {
        console.error("[marks] error", { userId, version }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "failed to fetch marks",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function syncMarks(c: AppContext) {
    const accountResult = requireAccount(c);
    if (Result.isError(accountResult)) {
        return handleResult(c, accountResult, () => {
            throw new Error("unreachable");
        });
    }

    const userId = c.get("userId")!;

    const body = await c.req.json();
    let parsed: Schema.Schema.Type<typeof MarksBody>;
    try {
        parsed = Schema.decodeUnknownSync(MarksBody)(body);
    } catch (error) {
        return c.json({
            error: error instanceof Error ? error.message : "validation failed",
        }, 400);
    }

    try {
        const now = Date.now();
        const upserted = await marksOperations.batchUpsertUserMarks(
            getDb(c),
            userId,
            [...parsed.marks],
            now,
        );

        return c.json({
            ok: true,
            marks: upserted.map((m) => ({
                tweetId: m.tweetId,
                mark: m.mark,
                version: m.lastModifiedVersion,
            })),
            serverTime: Date.now(),
        });
    } catch (error) {
        console.error("[marks/sync] error", { userId }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "failed to sync marks",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}
