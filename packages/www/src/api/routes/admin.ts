import * as Schema from "effect/Schema";
import { Result, handleResult, validate } from "../responder";
import { tweetsOperations } from "@comifuro/core";
import { getDb, requireAdmin } from "../auth";
import { NotFoundError, InternalError } from "../errors";
import { helpers } from "@comifuro/core";
import { parseIntegerQuery } from "../helpers";
import type { AppContext } from "../types";
import { TweetId } from "@comifuro/core/schema";

const AdminTweetMetadata = Schema.Struct({
    inferredFandoms: Schema.optional(Schema.Array(Schema.String)),
    matchedTags: Schema.optional(Schema.Array(Schema.String)),
});

const RerootThread = Schema.Struct({
    newRootTweetId: TweetId,
});

export async function listMissingThumbnails(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const limitResult = parseIntegerQuery(c.req.query("limit"), {
        name: "limit",
        defaultValue: 100,
        min: 1,
        max: 500,
    });
    if (!limitResult.ok) {
        return c.json({ error: limitResult.error }, 400);
    }
    const limit = limitResult.value;
    const cursorTweetId = c.req.query("cursorTweetId");
    const cursorMediaIndex = helpers.toNumberParam(c.req.query("cursorMediaIndex"));

    let cursor: { tweetId: TweetId; mediaIndex: number } | undefined;
    if (cursorTweetId && cursorMediaIndex != null) {
        const tweetIdResult = validate(TweetId, cursorTweetId);
        if (Result.isError(tweetIdResult)) {
            return c.json({ error: tweetIdResult.error.message }, 400);
        }
        cursor = { tweetId: tweetIdResult.value, mediaIndex: cursorMediaIndex };
    }

    try {
        const rows = await tweetsOperations.listTweetMediaMissingThumbnails(getDb(c), {
            limit,
            cursor,
        });
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
                    message: error instanceof Error ? error.message : "query failed",
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

    const tweetIdParam = c.req.param("tweetId");
    if (!tweetIdParam) {
        return c.json({ error: "missing tweetId" }, 400);
    }
    const tweetIdResult = validate(TweetId, tweetIdParam);
    if (Result.isError(tweetIdResult)) {
        return c.json({ error: tweetIdResult.error.message }, 400);
    }
    const tweetId = tweetIdResult.value;

    const mediaIndexRaw = c.req.param("mediaIndex");
    if (!mediaIndexRaw) {
        return c.json({ error: "missing mediaIndex" }, 400);
    }
    const mediaIndex = Number(mediaIndexRaw);
    if (!Number.isInteger(mediaIndex) || mediaIndex < 0) {
        return c.json({ error: "invalid mediaIndex" }, 400);
    }

    const body = await c.req.json();
    let parsed: Schema.Schema.Type<typeof SetThumbnailBody>;
    try {
        parsed = Schema.decodeUnknownSync(SetThumbnailBody)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    try {
        const updated = await tweetsOperations.setTweetMediaThumbnail(getDb(c), {
            tweetId,
            mediaIndex,
            thumbnailR2Key: parsed.thumbnailR2Key,
        });

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
                    message: error instanceof Error ? error.message : "update failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

const SetThumbnailBody = Schema.Struct({
    thumbnailR2Key: Schema.String,
});

export async function updateTweetMetadata(c: AppContext) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const idParam = c.req.param("id");
    if (!idParam) {
        return c.json({ error: "missing id" }, 400);
    }
    const idResult = validate(TweetId, idParam);
    if (Result.isError(idResult)) {
        return c.json({ error: idResult.error.message }, 400);
    }
    const id = idResult.value;

    const body = await c.req.json();
    let parsed: Schema.Schema.Type<typeof AdminTweetMetadata>;
    try {
        parsed = Schema.decodeUnknownSync(AdminTweetMetadata)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    if (parsed.inferredFandoms === undefined && parsed.matchedTags === undefined) {
        return c.json({ error: "at least one metadata field is required" }, 400);
    }

    try {
        const [tweet] = await tweetsOperations.updateTweetAdminMetadata(getDb(c), {
            id,
            inferredFandoms: helpers.normalizeTagList(
                parsed.inferredFandoms ? [...parsed.inferredFandoms] : undefined,
            ),
            matchedTags: helpers.normalizeTagList(
                parsed.matchedTags ? [...parsed.matchedTags] : undefined,
            ),
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
                    message: error instanceof Error ? error.message : "update failed",
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

    const rootParam = c.req.param("id");
    if (!rootParam) {
        return c.json({ error: "missing root tweet id" }, 400);
    }
    const rootResult = validate(TweetId, rootParam);
    if (Result.isError(rootResult)) {
        return c.json({ error: rootResult.error.message }, 400);
    }
    const rootTweetId = rootResult.value;

    const body = await c.req.json();
    let parsed: Schema.Schema.Type<typeof RerootThread>;
    try {
        parsed = Schema.decodeUnknownSync(RerootThread)(body);
    } catch (error) {
        return c.json(
            {
                error: error instanceof Error ? error.message : "validation failed",
            },
            400,
        );
    }

    try {
        const tweets = await tweetsOperations.rerootThread(getDb(c), {
            rootTweetId: rootTweetId,
            newRootTweetId: parsed.newRootTweetId,
            updatedAt: new Date(),
        });

        return c.json({ ok: true, tweets });
    } catch (error) {
        return handleResult(
            c,
            Result.err(
                new InternalError({
                    message: error instanceof Error ? error.message : "reroot failed",
                    cause: error,
                }),
            ),
            () => {
                throw new Error("unreachable");
            },
        );
    }
}

async function doUncatalogue(c: AppContext, reason: string, errorLabel: string) {
    const authResult = await requireAdmin(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const idParam = c.req.param("id");
    if (!idParam) {
        return c.json({ error: "missing id" }, 400);
    }
    const idResult = validate(TweetId, idParam);
    if (Result.isError(idResult)) {
        return c.json({ error: idResult.error.message }, 400);
    }
    const id = idResult.value;

    try {
        const [tweet] = await tweetsOperations.manualUncatalogueTweet(getDb(c), {
            id: id,
            reason,
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
                    message: error instanceof Error ? error.message : `${errorLabel} failed`,
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
    return doUncatalogue(c, "uncatalogued manually", "uncatalogue");
}

export async function removeFollowUp(c: AppContext) {
    return doUncatalogue(c, "removed from follow ups manually", "remove");
}
