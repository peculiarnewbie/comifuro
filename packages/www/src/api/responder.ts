import type { Context } from "hono";
import type { ApiError } from "./errors";
import type { Env } from "./types";
import * as EffectSchema from "effect/Schema";
import { ValidationError } from "./errors";

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
    isError<T, E extends ApiError>(result: Result<T, E>): result is { _tag: "err"; error: E } {
        return result._tag === "err";
    },
    match<T, E extends ApiError, R>(
        result: Result<T, E>,
        handlers: { ok: (value: T) => R; err: (error: E) => R },
    ): R {
        return result._tag === "ok" ? handlers.ok(result.value) : handlers.err(result.error);
    },
};

export function mapErrorToResponse(c: Context<Env>, error: ApiError): Response {
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
            console.error("[db error]", { requestId: c.get("requestId") }, error.cause);
            return c.json({ error: error.message }, 500);
        case "InternalError":
            console.error("[internal error]", { requestId: c.get("requestId") }, error.cause);
            return c.json({ error: error.message }, 500);
        default:
            console.error("[unknown error]", { requestId: c.get("requestId") }, error);
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

/**
 * Validate a raw string value against an Effect Schema.
 * Returns Result on failure so routes can return 400 without try/catch.
 */
export function validate<T>(
    schema: EffectSchema.Schema<T>,
    raw: string | undefined,
): Result<T, ValidationError> {
    if (raw === undefined || raw === "") {
        return Result.err(new ValidationError({ message: "missing required value", field: raw }));
    }
    try {
        const decoded = EffectSchema.decodeUnknownSync(schema as any)(raw);
        return Result.ok(decoded as T);
    } catch (error) {
        return Result.err(
            new ValidationError({
                message: error instanceof Error ? error.message : "validation failed",
                field: raw,
            }),
        );
    }
}

/**
 * Validate an optional query parameter. Returns undefined when absent.
 */
export function validateOptional<T>(
    schema: EffectSchema.Schema<T>,
    value: string | undefined,
): Result<T | undefined, ValidationError> {
    if (value === undefined || value === "") {
        return Result.ok(undefined);
    }
    try {
        const decoded = EffectSchema.decodeUnknownSync(schema as any)(value);
        return Result.ok(decoded as T);
    } catch (error) {
        return Result.err(
            new ValidationError({
                message: error instanceof Error ? error.message : "validation failed",
                field: value,
            }),
        );
    }
}
