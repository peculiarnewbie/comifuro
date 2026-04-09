import {
    sqliteTable,
    text,
    integer,
    index,
    primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const MarkValues = ["bookmarked", "ignored", "deleted"] as const;
export const TweetClassificationValues = [
    "unknown",
    "catalogue",
    "not_catalogue",
    "error",
] as const;
export const InferenceConfidenceValues = ["low", "medium", "high"] as const;

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
    version: integer("version").notNull(),
});

export const tweets = sqliteTable(
    "tweets",
    {
        id: text("id").primaryKey(),
        eventId: text("event_id").notNull().default("cf21"),
        user: text("user").notNull(),
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
        inferredFandomsConfidence: text("inferred_fandoms_confidence", {
            enum: InferenceConfidenceValues,
        }),
        inferredBoothId: text("inferred_booth_id"),
        inferredBoothIdConfidence: text("inferred_booth_id_confidence", {
            enum: InferenceConfidenceValues,
        }),
        rootTweetId: text("root_tweet_id"),
        parentTweetId: text("parent_tweet_id"),
        threadPosition: integer("thread_position"),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
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
            .references(() => tweets.id, { onDelete: "cascade" }),
        mediaIndex: integer("media_index").notNull(),
        r2Key: text("r2_key").notNull(),
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

export const scraperState = sqliteTable("scraper_state", {
    id: text("id").primaryKey(),
    lastSeenTweetId: text("last_seen_tweet_id"),
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

export const usersRelations = relations(users, ({ many }) => ({
    userPostRelations: many(userToTweet),
}));

export const tweetsRelations = relations(tweets, ({ many }) => ({
    userPostRelations: many(userToTweet),
    media: many(tweetMedia),
}));

export const tweetMediaRelations = relations(tweetMedia, ({ one }) => ({
    tweet: one(tweets, {
        fields: [tweetMedia.tweetId],
        references: [tweets.id],
    }),
}));

export const userPostRelations = relations(userToTweet, ({ one }) => ({
    user: one(users, {
        fields: [userToTweet.userId],
        references: [users.id],
    }),
    tweet: one(tweets, {
        fields: [userToTweet.tweetId],
        references: [tweets.id],
    }),
}));

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
