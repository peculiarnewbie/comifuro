export * from "./schema";
export * from "./db";
export * from "./migrate";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { tweets } from "./schema";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

export namespace tweetsTypes {
    export type TweetSelect = typeof schema.tweets.$inferSelect;
    export type TweetInsert = typeof schema.tweets.$inferInsert;
}

export namespace tweetsOperations {
    export const getTweet = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        id: string
    ) => {
        const tweet = await db
            .select()
            .from(tweets)
            .where(eq(tweets.id, id))
            .limit(1);
        return tweet[0];
    };

    export const insertTweet = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        tweet: tweetsTypes.TweetInsert
    ) => {
        return await db.insert(tweets).values(tweet).returning();
    };

    export const upsertTweet = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        tweet: tweetsTypes.TweetInsert
    ) => {
        return await db
            .insert(tweets)
            .values(tweet)
            .onConflictDoUpdate({
                target: tweets.id,
                set: tweet,
            })
            .returning();
    };

    export const selectTweets = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        opt?: {
            offset?: number;
            limit?: number;
        }
    ) => {
        const { offset = 0, limit = 100 } = opt || {};
        return await db.select().from(tweets).limit(limit).offset(offset);
    };
}
