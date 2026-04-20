import { TaggedError } from "better-result";

export class UnauthorizedError extends TaggedError("UnauthorizedError")<{
    message: string;
}>() {}

export class ForbiddenError extends TaggedError("ForbiddenError")<{
    message: string;
}>() {}

export class RateLimitedError extends TaggedError("RateLimitedError")<{
    message: string;
}>() {}

export class ValidationError extends TaggedError("ValidationError")<{
    message: string;
    field?: string;
}>() {}

export class NotFoundError extends TaggedError("NotFoundError")<{
    message: string;
    resource: string;
}>() {}

export class DatabaseError extends TaggedError("DatabaseError")<{
    message: string;
    cause: unknown;
}>() {}

export class InternalError extends TaggedError("InternalError")<{
    message: string;
    cause?: unknown;
}>() {}

export type ApiError =
    | InstanceType<typeof UnauthorizedError>
    | InstanceType<typeof ForbiddenError>
    | InstanceType<typeof RateLimitedError>
    | InstanceType<typeof ValidationError>
    | InstanceType<typeof NotFoundError>
    | InstanceType<typeof DatabaseError>
    | InstanceType<typeof InternalError>;
