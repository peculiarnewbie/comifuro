import { TweetClassificationValues, TweetId, UserId, EventId, BoothId, MarkValues } from "./schema";
import * as Schema from "effect/Schema";

export type { TweetId, UserId, EventId, BoothId } from "./schema";

// Explicit wire fields keep database-only dependencies (including Node Buffer)
// out of browsers and prevent new database columns from leaking into sync responses.
export const TweetSyncItemSchema = Schema.Struct({
    displayName: Schema.NullOr(Schema.String),
    text: Schema.String,
    tweetUrl: Schema.String,
    imageMask: Schema.Int,
    classification: Schema.Literals(TweetClassificationValues),
    threadPosition: Schema.NullOr(Schema.Int),
    id: TweetId,
    eventId: EventId,
    user: UserId,
    timestamp: Schema.Number,
    matchedTags: Schema.Array(Schema.String),
    inferredFandoms: Schema.Array(Schema.String),
    inferredBoothId: Schema.NullOr(BoothId),
    inferredItemTypes: Schema.Array(Schema.String),
    rootTweetId: Schema.NullOr(TweetId),
    parentTweetId: Schema.NullOr(TweetId),
    updatedAt: Schema.Number,
    deleted: Schema.Boolean,
    images: Schema.Array(Schema.String),
    thumbnails: Schema.Array(Schema.NullOr(Schema.String)),
});
export type TweetSyncItem = Schema.Schema.Type<typeof TweetSyncItemSchema>;

export const TweetSyncCursor = Schema.Struct({
    updatedAt: Schema.Number,
    id: TweetId,
});
export type TweetSyncCursor = Schema.Schema.Type<typeof TweetSyncCursor>;

export const TweetSyncResponse = Schema.Struct({
    eventId: Schema.String,
    syncToken: Schema.String,
    items: Schema.Array(TweetSyncItemSchema),
    nextCursor: Schema.NullOr(TweetSyncCursor),
    hasMore: Schema.Boolean,
    serverTime: Schema.Number,
});
export type TweetSyncResponse = Schema.Schema.Type<typeof TweetSyncResponse>;

export const MarkResponseEntry = Schema.Struct({
    tweetId: Schema.String,
    mark: Schema.Literals(MarkValues),
    version: Schema.Number,
});
export type MarkResponseEntry = Schema.Schema.Type<typeof MarkResponseEntry>;

export const MarksResponse = Schema.Struct({
    marks: Schema.Array(MarkResponseEntry),
    serverTime: Schema.Number,
});
export type MarksResponse = Schema.Schema.Type<typeof MarksResponse>;
