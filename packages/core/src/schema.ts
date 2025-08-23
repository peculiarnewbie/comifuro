import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Define mark values as const array
const MarkValues = ['bookmarked', 'ignored'] as const;
export type MarkType = typeof MarkValues[number];

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

// Existing tweets table (unchanged)
export const tweets = sqliteTable('tweets', {
  id: text('id').primaryKey(),
  user: text('user').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  text: text('text').notNull(),
  imageMask: integer('image_mask').notNull().default(0),
});

// User-Post relations table
export const userPostRelations = sqliteTable('user_post_relations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tweetId: text('tweet_id').notNull().references(() => tweets.id),
  mark: text('mark', { enum: MarkValues }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  userPostRelations: many(userPostRelations),
}));

export const tweetsRelations = relations(tweets, ({ many }) => ({
  userPostRelations: many(userPostRelations),
}));

export const userPostRelationsRelations = relations(userPostRelations, ({ one }) => ({
  user: one(users, { fields: [userPostRelations.userId], references: [users.id] }),
  tweet: one(tweets, { fields: [userPostRelations.tweetId], references: [tweets.id] }),
}));