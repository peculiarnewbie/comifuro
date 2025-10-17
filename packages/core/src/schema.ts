import {
    sqliteTable,
    text,
    integer,
    index,
    primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

const MarkValues = ["bookmarked", "ignored", "deleted"] as const;
// type MarkType = (typeof MarkValues)[number];

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
        user: text("user").notNull(),
        timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
        text: text("text").notNull(),
        imageMask: integer("image_mask").notNull().default(0),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
        deleted: integer("deleted", { mode: "boolean" }),
    },
    (table) => [
        index("user_idx").on(table.user),
        index("deleted_idx").on(table.deleted),
        index("updated_at_idx").on(table.updatedAt),
    ],
);

export const userToTweet = sqliteTable(
    "user_to_tweet",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id),
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

export const replicacheClients = sqliteTable(
    "replicache_clients",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id),
        lastMutationId: integer("last_mutation_id").notNull().default(0),
        lastModifiedVersion: integer("last_modified_version")
            .notNull()
            .default(0),
    },
    (t) => [index("user_with_mutation_idx").on(t.userId, t.lastMutationId)],
);
