import type { Context } from "hono";
import { Result } from "better-result";
import type { ApiError } from "./errors";
import type { Env } from "./types";

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
    return result.match({
        ok: okHandler,
        err: (error) => mapErrorToResponse(c, error),
    });
}
