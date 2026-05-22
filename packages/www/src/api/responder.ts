import type { Context } from "hono";
import type { ApiError } from "./errors";
import type { Env } from "./types";

export type Result<T, E extends ApiError = ApiError> =
    | { _tag: "ok"; value: T }
    | { _tag: "err"; error: E };

export const Result = {
    ok<T>(value: T): Result<T, never> {
        return { _tag: "ok", value };
    },
    err<E extends ApiError>(error: E): Result<never, E> {
        return { _tag: "err", error };
    },
    isError<T, E extends ApiError>(
        result: Result<T, E>,
    ): result is { _tag: "err"; error: E } {
        return result._tag === "err";
    },
    match<T, E extends ApiError, R>(
        result: Result<T, E>,
        handlers: { ok: (value: T) => R; err: (error: E) => R },
    ): R {
        return result._tag === "ok"
            ? handlers.ok(result.value)
            : handlers.err(result.error);
    },
};

export function mapErrorToResponse(
    c: Context<Env>,
    error: ApiError,
): Response {
    switch (error._tag) {
        case "UnauthorizedError":
            return c.json({ error: error.message }, 401);
        case "ForbiddenError":
            return c.json({ error: error.message }, 403);
        case "RateLimitedError":
            return c.json({ error: error.message }, 429);
        case "ValidationError":
            return c.json({ error: error.message }, 400);
        case "NotFoundError":
            return c.json({ error: error.message }, 404);
        case "DatabaseError":
            console.error("[db error]", error.cause);
            return c.json({ error: error.message }, 500);
        case "InternalError":
            console.error("[internal error]", error.cause);
            return c.json({ error: error.message }, 500);
        default:
            console.error("[unknown error]", error);
            return c.json({ error: "internal server error" }, 500);
    }
}

export function handleResult<T>(
    c: Context<Env>,
    result: Result<T, ApiError>,
    okHandler: (value: T) => Response,
): Response {
    return Result.match(result, {
        ok: okHandler,
        err: (error) => mapErrorToResponse(c, error),
    });
}
