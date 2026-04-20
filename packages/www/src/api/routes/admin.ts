import { z } from "zod";
import { Result } from "better-result";
import { tweetsOperations } from "@comifuro/core";
import { getDb, requireAdmin } from "../auth";
import { ValidationError, NotFoundError, InternalError } from "../errors";
import { handleResult } from "../responder";
import { normalizeTagList, toNumberParam } from "../helpers";
import type { AppContext } from "../types";

const adminTweetMetadataSchema = z
    .object({
        inferredFandoms: z.array(z.string().min(1)).optional(),
        matchedTags: z.array(z.string().min(1)).optional(),
    })
    .refine(
        (value) =>
            value.inferredFandoms !== undefined ||
            value.matchedTags !== undefined,
        {
            message: "at least one metadata field is required",
        },
    );

const rerootThreadSchema = z.object({
    newRootTweetId: z.string().min(1),
});

export async function listMissingThumbnails(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const limit = Math.min(
        Math.max(Number(c.req.query("limit") ?? 100), 1),
        500,
    );
    const cursorTweetId = c.req.query("cursorTweetId");
    const cursorMediaIndex = toNumberParam(c.req.query("cursorMediaIndex"));
    const cursor =
        cursorTweetId && cursorMediaIndex != null
            ? { tweetId: cursorTweetId, mediaIndex: cursorMediaIndex }
            : undefined;

    try {
        const rows = await tweetsOperations.listTweetMediaMissingThumbnails(
            getDb(c),
            { limit, cursor },
        );
        const lastRow = rows[rows.length - 1];

        return c.json({
            items: rows.map((row) => ({
                tweetId: row.tweetId,
                mediaIndex: row.mediaIndex,
                r2Key: row.r2Key,
            })),
            nextCursor:
                lastRow && rows.length === limit
                    ? {
                          tweetId: lastRow.tweetId,
                          mediaIndex: lastRow.mediaIndex,
                      }
                    : null,
        });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "query failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function setThumbnail(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const tweetId = c.req.param("tweetId")!;
    const mediaIndex = Number(c.req.param("mediaIndex")!);
    if (!Number.isInteger(mediaIndex) || mediaIndex < 0) {
        return c.json({ error: "invalid mediaIndex" }, 400);
    }

    const body = await c.req.json();
    const parsed = z
        .object({ thumbnailR2Key: z.string().min(1) })
        .safeParse(body);
    if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }

    try {
        const updated = await tweetsOperations.setTweetMediaThumbnail(
            getDb(c),
            {
                tweetId,
                mediaIndex,
                thumbnailR2Key: parsed.data.thumbnailR2Key,
            },
        );

        if (updated.length === 0) {
            return handleResult(
                c,
                Result.err(
                    new NotFoundError({
                        message: "media not found",
                        resource: "media",
                    }),
                ),
                () => {
                    throw new Error("unreachable");
                },
            );
        }

        return c.json({ ok: true });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "update failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function updateTweetMetadata(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const body = await c.req.json();
    const parsed = adminTweetMetadataSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }

    try {
        const [tweet] = await tweetsOperations.updateTweetAdminMetadata(
            getDb(c),
            {
                id: c.req.param("id")!,
                inferredFandoms: normalizeTagList(parsed.data.inferredFandoms),
                matchedTags: normalizeTagList(parsed.data.matchedTags),
                updatedAt: new Date(),
            },
        );

        if (!tweet) {
            return handleResult(
                c,
                Result.err(
                    new NotFoundError({
                        message: "tweet not found",
                        resource: "tweet",
                    }),
                ),
                () => {
                    throw new Error("unreachable");
                },
            );
        }

        return c.json({ ok: true, tweet });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "update failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function rerootThread(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const body = await c.req.json();
    const parsed = rerootThreadSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message }, 400);
    }

    try {
        const tweets = await tweetsOperations.rerootThread(getDb(c), {
            rootTweetId: c.req.param("id")!,
            newRootTweetId: parsed.data.newRootTweetId,
            updatedAt: new Date(),
        });

        return c.json({ ok: true, tweets });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error ? error.message : "reroot failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function uncatalogueTweet(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    try {
        const [tweet] = await tweetsOperations.manualUncatalogueTweet(getDb(c), {
            id: c.req.param("id")!,
            reason: "uncatalogued manually",
            updatedAt: new Date(),
        });

        if (!tweet) {
            return handleResult(
                c,
                Result.err(
                    new NotFoundError({
                        message: "tweet not found",
                        resource: "tweet",
                    }),
                ),
                () => {
                    throw new Error("unreachable");
                },
            );
        }

        return c.json({ ok: true, tweet });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "uncatalogue failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

export async function removeFollowUp(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    try {
        const [tweet] = await tweetsOperations.manualUncatalogueTweet(getDb(c), {
            id: c.req.param("id")!,
            reason: "removed from follow ups manually",
            updatedAt: new Date(),
        });

        if (!tweet) {
            return handleResult(
                c,
                Result.err(
                    new NotFoundError({
                        message: "tweet not found",
                        resource: "tweet",
                    }),
                ),
                () => {
                    throw new Error("unreachable");
                },
            );
        }

        return c.json({ ok: true, tweet });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message:
                        error instanceof Error
                            ? error.message
                            : "remove failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}
