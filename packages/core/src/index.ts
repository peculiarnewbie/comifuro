import { DrizzleD1Database } from "drizzle-orm/d1";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
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
            .from(schema.tweets)
            .where(eq(schema.tweets.id, id))
            .limit(1);
        return tweet[0];
    };

    export const insertTweet = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        tweet: tweetsTypes.TweetInsert
    ) => {
        return await db.insert(schema.tweets).values(tweet).returning();
    };

    export const upsertTweet = async (
        db: DrizzleD1Database<typeof schema> | BunSQLiteDatabase<typeof schema>,
        tweet: tweetsTypes.TweetInsert
    ) => {
        return await db
            .insert(schema.tweets)
            .values(tweet)
            .onConflictDoUpdate({
                target: schema.tweets.id,
                set: tweet,
            })
            .returning();
    };

    export const upsertMultipleTweets = async (
        db: DrizzleD1Database | BunSQLiteDatabase<typeof schema>,
        tweetsInsert: tweetsTypes.TweetInsert[]
    ) => {
        console.log("upsertMultipleTweets", tweetsInsert);
        return await db
            .insert(schema.tweets)
            .values(tweetsInsert)
            .onConflictDoUpdate({
                target: schema.tweets.id,
                set: {
                    user: sql.raw(`excluded.${schema.tweets.user.name}`),
                    timestamp: sql.raw(
                        `excluded.${schema.tweets.timestamp.name}`
                    ),
                    text: sql.raw(`excluded.${schema.tweets.text.name}`),
                    imageMask: sql.raw(
                        `excluded.${schema.tweets.imageMask.name}`
                    ),
                },
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
        return await db
            .select()
            .from(schema.tweets)
            .limit(limit)
            .offset(offset);
    };
}
