import {
    sqliteTable,
    text,
    integer,
    index,
    primaryKey,
} from "drizzle-orm/sqlite-core";
import * as Schema from "effect/Schema";

export const TweetId = Schema.brand("TweetId")(Schema.String);
export type TweetId = Schema.Schema.Type<typeof TweetId>;

export const UserId = Schema.brand("UserId")(Schema.String);
export type UserId = Schema.Schema.Type<typeof UserId>;

export const EventId = Schema.brand("EventId")(Schema.String);
export type EventId = Schema.Schema.Type<typeof EventId>;

export const BoothId = Schema.brand("BoothId")(Schema.String);
export type BoothId = Schema.Schema.Type<typeof BoothId>;

export const MarkValues = ["bookmarked", "ignored", "deleted"] as const;
export const TweetClassificationValues = [
    "unknown",
    "catalogue",
    "not_catalogue",
    "error",
] as const;

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    username: text("username").unique(),
    email: text("email").unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    version: integer("version").notNull().default(0),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
});

export const tweets = sqliteTable(
    "tweets",
    {
        id: text("id").primaryKey().$type<TweetId>(),
        eventId: text("event_id").notNull().default("cf21").$type<EventId>(),
        user: text("user").notNull().$type<UserId>(),
        displayName: text("display_name"),
        timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
        text: text("text").notNull(),
        tweetUrl: text("tweet_url").notNull(),
        searchQuery: text("search_query"),
        matchedTags: text("matched_tags", { mode: "json" }).$type<string[]>(),
        imageMask: integer("image_mask").notNull().default(0),
        classification: text("classification", {
            enum: TweetClassificationValues,
        })
            .notNull()
            .default("unknown"),
        classificationReason: text("classification_reason"),
        classifierPromptVersion: text("classifier_prompt_version"),
        inferredFandoms: text("inferred_fandoms", { mode: "json" }).$type<
            string[] | null
        >(),
        inferredFandomsConfidence: text("inferred_fandoms_confidence"),
        inferredBoothId: text("inferred_booth_id").$type<BoothId | null>(),
        inferredBoothIdConfidence: text("inferred_booth_id_confidence"),
        inferredItemTypes: text("inferred_item_types", { mode: "json" }).$type<
            string[] | null
        >(),
        rootTweetId: text("root_tweet_id").$type<TweetId | null>(),
        parentTweetId: text("parent_tweet_id").$type<TweetId | null>(),
        threadPosition: integer("thread_position"),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        deleted: integer("deleted", { mode: "boolean" }),
    },
    (table) => [
        index("user_idx").on(table.user),
        index("deleted_idx").on(table.deleted),
        index("updated_at_idx").on(table.updatedAt),
        index("classification_idx").on(table.classification),
        index("timestamp_idx").on(table.timestamp),
        index("event_id_idx").on(table.eventId),
        index("event_root_tweet_idx").on(table.eventId, table.rootTweetId),
        index("event_root_thread_position_idx").on(
            table.eventId,
            table.rootTweetId,
            table.threadPosition,
            table.id,
        ),
        index("parent_tweet_idx").on(table.parentTweetId),
        index("event_updated_id_idx").on(
            table.eventId,
            table.updatedAt,
            table.id,
        ),
    ],
);

export const tweetMedia = sqliteTable(
    "tweet_media",
    {
        tweetId: text("tweet_id")
            .notNull()
            .$type<TweetId>()
            .references(() => tweets.id, { onDelete: "cascade" }),
        mediaIndex: integer("media_index").notNull(),
        r2Key: text("r2_key").notNull(),
        thumbnailR2Key: text("thumbnail_r2_key"),
        sourceUrl: text("source_url").notNull(),
        contentType: text("content_type"),
        width: integer("width"),
        height: integer("height"),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [
        primaryKey({ columns: [table.tweetId, table.mediaIndex] }),
        index("tweet_media_key_idx").on(table.r2Key),
    ],
);

export const BoothStatusValues = [
    "unknown",
    "available",
    "occupied",
    "reserved",
] as const;

export const booths = sqliteTable(
    "booths",
    {
        eventId: text("event_id").notNull().$type<EventId>(),
        id: text("id").notNull().$type<BoothId>(),
        section: text("section").notNull(),
        status: text("status", { enum: BoothStatusValues })
            .notNull()
            .default("unknown"),
        exhibitorUser: text("exhibitor_user"),
        exhibitorDisplayName: text("exhibitor_display_name"),
        primaryTweetId: text("primary_tweet_id").$type<TweetId | null>().references(() => tweets.id),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [
        primaryKey({ columns: [table.eventId, table.id] }),
        index("booths_event_id_idx").on(table.eventId),
        index("booths_status_idx").on(table.status),
        index("booths_primary_tweet_idx").on(table.primaryTweetId),
    ],
);

export const userEventMeta = sqliteTable(
    "user_event_meta",
    {
        user: text("user").notNull().$type<UserId>(),
        eventId: text("event_id").notNull().$type<EventId>(),
        boothId: text("booth_id").$type<BoothId | null>(),
        preorderDeadline: text("preorder_deadline"),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [
        primaryKey({ columns: [table.user, table.eventId] }),
        index("user_meta_event_idx").on(table.eventId),
    ],
);

export const items = sqliteTable(
    "items",
    {
        id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
        eventId: text("event_id").notNull().$type<EventId>(),
        user: text("user").notNull().$type<UserId>(),
        sourceTweetId: text("source_tweet_id")
            .notNull()
            .$type<TweetId>()
            .references(() => tweets.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        price: text("price"),
        fandom: text("fandom"),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [
        index("items_event_user_idx").on(table.eventId, table.user),
        index("items_source_tweet_idx").on(table.sourceTweetId),
    ],
);

export const scraperState = sqliteTable("scraper_state", {
    id: text("id").primaryKey(),
    checkpoint: text("checkpoint").$type<TweetId | null>(),
    startTweetId: text("start_tweet_id").$type<TweetId | null>(),
    endTweetId: text("end_tweet_id").$type<TweetId | null>(),
    lastSeenTweetId: text("last_seen_tweet_id").$type<TweetId | null>(),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
});

export const userToTweet = sqliteTable(
    "user_to_tweet",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tweetId: text("tweet_id")
            .notNull()
            .$type<TweetId>()
            .references(() => tweets.id),
        mark: text("mark", { enum: MarkValues }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        deleted: integer("deleted", { mode: "boolean" })
            .notNull()
            .default(false),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        lastModifiedVersion: integer("last_modified_version")
            .notNull()
            .default(0),
        tags: text("tags", { mode: "json" }).$type<string[]>(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.tweetId] }),
        index("user_with_version_idx").on(t.userId, t.lastModifiedVersion),
    ],
);

export const replicacheClientGroups = sqliteTable(
    "replicache_client_groups",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
    },
    (t) => [index("user_client_group_idx").on(t.userId)],
);

export const replicacheClients = sqliteTable(
    "replicache_clients",
    {
        id: text("id").primaryKey(),
        clientGroupId: text("client_group_id")
            .notNull()
            .references(() => replicacheClientGroups.id, {
                onDelete: "cascade",
            }),
        lastMutationId: integer("last_mutation_id").notNull().default(0),
        lastModifiedVersion: integer("last_modified_version")
            .notNull()
            .default(0),
    },
    (t) => [
        index("group_with_mutation_idx").on(t.clientGroupId, t.lastMutationId),
    ],
);
