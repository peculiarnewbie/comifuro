import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tweets = sqliteTable('tweets', {
  id: text('id').primaryKey(),
  user: text('user').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  text: text('text').notNull(),
  imageMask: integer('image_mask').notNull().default(0),
});