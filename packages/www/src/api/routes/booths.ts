import { z } from "zod";
import { Result } from "better-result";
import { boothsOperations } from "@comifuro/core";
import { getDb, requireAdmin } from "../auth";
import { ValidationError, NotFoundError, InternalError } from "../errors";
import { handleResult } from "../responder";
import { normalizeEventId, toNumberParam } from "../helpers";
import type { AppContext } from "../types";

const boothStatusSchema = z.enum(["unknown", "available", "occupied", "reserved"]);

export async function listBooths(c: AppContext) {
    const eventId = normalizeEventId(c.req.query("eventId"), "cf22");
    const status = c.req.query("status");
    const limit = Math.min(Math.max(toNumberParam(c.req.query("limit")) ?? 500, 1), 1000);
    const offset = Math.max(toNumberParam(c.req.query("offset")) ?? 0, 0);

    const parsedStatus = status
        ? boothStatusSchema.safeParse(status)
        : null;
    if (parsedStatus && !parsedStatus.success) {
        return c.json({ error: "invalid status" }, 400);
    }

    try {
        const rows = await boothsOperations.listBooths(getDb(c), eventId, {
            status: parsedStatus?.data,
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
                    message:
                        error instanceof Error ? error.message : "list failed",
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
    const eventId = normalizeEventId(c.req.query("eventId"), "cf22");
    const id = c.req.param("id")!;

    try {
        const result = await boothsOperations.getBoothWithTweets(getDb(c), eventId, id.toUpperCase());
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
                    message:
                        error instanceof Error ? error.message : "get failed",
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

    const eventId = normalizeEventId(c.req.query("eventId"), "cf22");

    try {
        const inserted = await boothsOperations.rebuildBoothsFromTweets(
            getDb(c),
            eventId,
        );
        return c.json({ ok: true, eventId, count: inserted.length });
    } catch (error) {
        console.error("[booths] rebuild error", { eventId }, error);
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "rebuild failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}
