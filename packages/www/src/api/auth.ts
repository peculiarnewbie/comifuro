import type { Context, Next } from "hono";
import { Result } from "better-result";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { users } from "@comifuro/core/schema";
import {
    UnauthorizedError,
    ForbiddenError,
    ValidationError,
} from "./errors";
import type { Env, AppContext } from "./types";

export function getDb(c: AppContext): DrizzleD1Database {
    return drizzle(c.env.DB) as DrizzleD1Database;
}

async function safeEqual(
    actual: string | undefined,
    expected: string | undefined,
): Promise<boolean> {
    const encoder = new TextEncoder();
    const a = encoder.encode(actual ?? "");
    const b = encoder.encode(expected ?? "");

    const hashA = await crypto.subtle.digest("SHA-256", a);
    const hashB = await crypto.subtle.digest("SHA-256", b);

    return (crypto.subtle as any).timingSafeEqual(
        new Uint8Array(hashA),
        new Uint8Array(hashB),
    );
}

export async function requirePassword(
    c: AppContext,
): Promise<Result<null, ForbiddenError>> {
    const password = c.req.header("pec-password");

    if (!(await safeEqual(password, c.env.PASSWORD))) {
        return Result.err(new ForbiddenError({ message: "unauthed" }));
    }

    return Result.ok(null);
}

export async function resolveAccount(c: AppContext, next: Next) {
    const accountId = c.req.header("x-account-id")?.trim();

    if (!accountId) {
        c.set("userId", null);
        c.set("isAdmin", false);
        return next();
    }

    const db = getDb(c);
    const now = new Date();

    const [user] = await db
        .insert(users)
        .values({
            id: accountId,
            version: 0,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: users.id,
            set: {
                updatedAt: now,
            },
        })
        .returning();

    c.set("userId", user.id);
    c.set("isAdmin", user.isAdmin ?? false);

    return next();
}

export function requireAccount(
    c: AppContext,
): Result<null, UnauthorizedError> {
    const userId = c.get("userId");
    if (!userId) {
        return Result.err(
            new UnauthorizedError({ message: "unauthorized: missing account" }),
        );
    }
    return Result.ok(null);
}

export async function requireAdmin(
    c: AppContext,
): Promise<Result<null, UnauthorizedError | ForbiddenError>> {
    const accountResult = requireAccount(c);
    if (Result.isError(accountResult)) {
        return accountResult;
    }

    const isAdmin = c.get("isAdmin");
    if (!isAdmin) {
        return Result.err(
            new ForbiddenError({ message: "forbidden: admin only" }),
        );
    }

    return requirePassword(c);
}
