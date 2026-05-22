export class UnauthorizedError extends Error {
    readonly _tag = "UnauthorizedError" as const;
    constructor(opts: { message: string }) {
        super(opts.message);
        this.name = "UnauthorizedError";
    }
}

export class ForbiddenError extends Error {
    readonly _tag = "ForbiddenError" as const;
    constructor(opts: { message: string }) {
        super(opts.message);
        this.name = "ForbiddenError";
    }
}

export class RateLimitedError extends Error {
    readonly _tag = "RateLimitedError" as const;
    constructor(opts: { message: string }) {
        super(opts.message);
        this.name = "RateLimitedError";
    }
}

export class ValidationError extends Error {
    readonly _tag = "ValidationError" as const;
    field?: string;
    constructor(opts: { message: string; field?: string }) {
        super(opts.message);
        this.name = "ValidationError";
        this.field = opts.field;
    }
}

export class NotFoundError extends Error {
    readonly _tag = "NotFoundError" as const;
    resource: string;
    constructor(opts: { message: string; resource: string }) {
        super(opts.message);
        this.name = "NotFoundError";
        this.resource = opts.resource;
    }
}

export class DatabaseError extends Error {
    readonly _tag = "DatabaseError" as const;
    cause: unknown;
    constructor(opts: { message: string; cause: unknown }) {
        super(opts.message);
        this.name = "DatabaseError";
        this.cause = opts.cause;
    }
}

export class InternalError extends Error {
    readonly _tag = "InternalError" as const;
    cause?: unknown;
    constructor(opts: { message: string; cause?: unknown }) {
        super(opts.message);
        this.name = "InternalError";
        this.cause = opts.cause;
    }
}

export type ApiError =
    | UnauthorizedError
    | ForbiddenError
    | RateLimitedError
    | ValidationError
    | NotFoundError
    | DatabaseError
    | InternalError;
