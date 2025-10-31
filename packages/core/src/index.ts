import { DrizzleD1Database } from "drizzle-orm/d1";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { replicacheClients, tweets, userToTweet } from "./schema";
import { TweetInsert } from "./types";

export namespace tweetsOperations {
    export const getTweet = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        id: string,
    ) => {
        const tweet = await db
            .select()
            .from(tweets)
            .where(eq(tweets.id, id))
            .limit(1);
        return tweet[0];
    };

    export const insertTweet = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        tweet: TweetInsert,
    ) => {
        return await db.insert(tweets).values(tweet).returning();
    };

    export const upsertTweet = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        tweet: TweetInsert,
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

    export const upsertMultipleTweets = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        tweetsInsert: TweetInsert[],
    ) => {
        console.log("upsertMultipleTweets", tweetsInsert);
        return await db
            .insert(tweets)
            .values(tweetsInsert)
            .onConflictDoUpdate({
                target: tweets.id,
                set: {
                    user: sql.raw(`excluded.${tweets.user.name}`),
                    timestamp: sql.raw(`excluded.${tweets.timestamp.name}`),
                    text: sql.raw(`excluded.${tweets.text.name}`),
                    imageMask: sql.raw(`excluded.${tweets.imageMask.name}`),
                },
            })
            .returning();
    };

    export const selectTweets = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        opt?: {
            offset?: number;
            limit?: number;
        },
    ) => {
        const { offset = 0, limit = 100 } = opt || {};
        return await db.select().from(tweets).limit(limit).offset(offset);
    };

    export const getNewestTweet = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
    ) => {
        return await db.select().from(tweets).orderBy(desc(tweets.id)).limit(1);
    };

    export const getNewerTweets = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        newestTweet: string,
        limit = 100,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(gt(tweets.id, newestTweet))
            .orderBy(desc(tweets.id))
            .limit(limit);
    };

    export const getOlderTweets = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        oldestTweet: string,
        limit = 100,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(lt(tweets.id, oldestTweet))
            .orderBy(desc(tweets.id))
            .limit(limit);
    };
}

export namespace marksOperations {
    export const getUserMarks = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        userId: string,
        prevVersion: number,
    ) => {
        return await db
            .select()
            .from(userToTweet)
            .where(
                and(
                    eq(userToTweet.userId, userId),
                    gt(userToTweet.lastModifiedVersion, prevVersion),
                ),
            );
    };
}

export namespace replicacheOperations {
    export const getUser = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        userId: string,
    ) => {
        return await db.select().from(users).where(eq(users.id, userId));
    };

    export const getOutdatedReplicacheClients = async (
        db: DrizzleD1Database | BunSQLiteDatabase,
        clientGroup: string,
        prevVersion: number,
    ) => {
        return await db
            .select()
            .from(replicacheClients)
            .where(
                and(
                    eq(replicacheClients.clientGroupId, clientGroup),
                    gt(replicacheClients.lastModifiedVersion, prevVersion),
                ),
            );
    };
}
