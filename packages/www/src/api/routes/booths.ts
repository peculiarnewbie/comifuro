import * as Schema from "effect/Schema";
import { boothsOperations } from "@comifuro/core";
import { getDb, requireAdmin } from "../auth";
import { NotFoundError, InternalError } from "../errors";
import { Result, handleResult, validate } from "../responder";
import { parseIntegerQuery } from "../helpers";
import type { AppContext } from "../types";
import { EventId, BoothId } from "@comifuro/core/schema";

const BoothStatusValues = ["unknown", "available", "occupied", "reserved"] as const;
const BoothStatus = Schema.Literals(BoothStatusValues);
type BoothStatusValue = (typeof BoothStatusValues)[number];

export async function listBooths(c: AppContext) {
    const eventIdResult = validate(EventId, c.req.query("eventId"));
    if (Result.isError(eventIdResult)) {
        return c.json({ error: eventIdResult.error.message }, 400);
    }
    const eventId = eventIdResult.value;
    const limitResult = parseIntegerQuery(c.req.query("limit"), {
        name: "limit",
        defaultValue: 500,
        min: 1,
        max: 1000,
    });
    if (!limitResult.ok) {
        return c.json({ error: limitResult.error }, 400);
    }
    const offsetResult = parseIntegerQuery(c.req.query("offset"), {
        name: "offset",
        defaultValue: 0,
        min: 0,
    });
    if (!offsetResult.ok) {
        return c.json({ error: offsetResult.error }, 400);
    }
    const limit = limitResult.value;
    const offset = offsetResult.value;

    const status = c.req.query("status");
    let parsedStatus: BoothStatusValue | undefined;
    if (status) {
        const statusResult = validate(BoothStatus, status);
        if (Result.isError(statusResult)) {
            return c.json({ error: statusResult.error.message }, 400);
        }
        parsedStatus = statusResult.value as BoothStatusValue;
    }

    try {
        const rows = await boothsOperations.listBooths(getDb(c), eventId, {
            status: parsedStatus,
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
    const eventIdResult = validate(EventId, c.req.query("eventId"));
    if (Result.isError(eventIdResult)) {
        return c.json({ error: eventIdResult.error.message }, 400);
    }
    const eventId = eventIdResult.value;

    const idParam = c.req.param("id");
    if (!idParam) {
        return c.json({ error: "missing id" }, 400);
    }
    const idResult = validate(BoothId, idParam.toUpperCase());
    if (Result.isError(idResult)) {
        return c.json({ error: idResult.error.message }, 400);
    }
    const id = idResult.value;

    try {
        const result = await boothsOperations.getBoothWithTweets(getDb(c), eventId, id);
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
        console.error("[booths] get error", { eventId, id: idParam }, error);
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

    const eventIdResult = validate(EventId, c.req.query("eventId"));
    if (Result.isError(eventIdResult)) {
        return c.json({ error: eventIdResult.error.message }, 400);
    }
    const eventId = eventIdResult.value;

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
