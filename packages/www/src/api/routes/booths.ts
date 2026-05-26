import * as Schema from "effect/Schema";
import { boothsOperations } from "@comifuro/core";
import { getDb, requireAdmin } from "../auth";
import { NotFoundError, InternalError } from "../errors";
import { Result, handleResult } from "../responder";
import { helpers } from "@comifuro/core";
import type { AppContext } from "../types";
import { EventId, BoothId } from "@comifuro/core/schema";

const BoothStatus = Schema.Literals(["unknown", "available", "occupied", "reserved"] as const);

export async function listBooths(c: AppContext) {
    const eventId = helpers.normalizeEventId(
        c.req.query("eventId"),
        Schema.decodeUnknownSync(EventId)("cf22"),
    );
    const limit = Math.min(Math.max(helpers.toNumberParam(c.req.query("limit")) ?? 500, 1), 1000);
    const offset = Math.max(helpers.toNumberParam(c.req.query("offset")) ?? 0, 0);

    const status = c.req.query("status");
    let parsedStatus: string | undefined;
    if (status) {
        try {
            parsedStatus = Schema.decodeUnknownSync(BoothStatus)(status);
        } catch {
            return c.json({ error: "invalid status" }, 400);
        }
    }

    try {
        const rows = await boothsOperations.listBooths(getDb(c), eventId, {
            status: parsedStatus as "unknown" | "available" | "occupied" | "reserved" | undefined,
            limit,
            offset,
        });
        return c.json({ eventId, booths: rows });
    } catch (error) {
        console.error("[booths] list error", { eventId }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message: error instanceof Error ? error.message : "list failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function getBooth(c: AppContext) {
    const eventId = helpers.normalizeEventId(
        c.req.query("eventId"),
        Schema.decodeUnknownSync(EventId)("cf22"),
    );
    const id = c.req.param("id")!;

    try {
        const idValue = Schema.decodeUnknownSync(BoothId)(id.toUpperCase());
        const result = await boothsOperations.getBoothWithTweets(getDb(c), eventId, idValue);
        if (!result.booth) {
            return handleResult(
                c,
                Result.err(
                    new NotFoundError({
                        message: "booth not found",
                        resource: "booth",
                    }),
                ),
                () => {
                    throw new Error("unreachable");
                },
            );
        }
        return c.json({ eventId, booth: result.booth, tweets: result.tweets });
    } catch (error) {
        console.error("[booths] get error", { eventId, id }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message: error instanceof Error ? error.message : "get failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function rebuildBooths(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const eventId = helpers.normalizeEventId(
        c.req.query("eventId"),
        Schema.decodeUnknownSync(EventId)("cf22"),
    );

    try {
        const inserted = await boothsOperations.rebuildBoothsFromTweets(getDb(c), eventId);
        return c.json({ ok: true, eventId, count: inserted.length });
    } catch (error) {
        console.error("[booths] rebuild error", { eventId }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message: error instanceof Error ? error.message : "rebuild failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}
