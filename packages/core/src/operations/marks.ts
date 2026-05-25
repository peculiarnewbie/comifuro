import { and, eq, gt, sql } from "drizzle-orm";
import { userToTweet, MarkValues } from "../schema";
import type { TweetId } from "../schema";
import type { SupportedDb } from "./_shared";

export const getUserMarks = async (db: SupportedDb, userId: string, prevVersion: number) => {
    return await db
        .select()
        .from(userToTweet)
        .where(
            and(eq(userToTweet.userId, userId), gt(userToTweet.lastModifiedVersion, prevVersion)),
        );
};

export const upsertUserMark = async (
    db: SupportedDb,
    input: {
        userId: string;
        tweetId: TweetId;
        mark: string;
        version: number;
    },
) => {
    return await db
        .insert(userToTweet)
        .values({
            userId: input.userId,
            tweetId: input.tweetId,
            mark: input.mark as (typeof MarkValues)[number],
            lastModifiedVersion: input.version,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [userToTweet.userId, userToTweet.tweetId],
            set: {
                mark: sql.raw(`excluded.${userToTweet.mark.name}`),
                lastModifiedVersion: sql.raw(`excluded.${userToTweet.lastModifiedVersion.name}`),
                updatedAt: sql.raw(`excluded.${userToTweet.updatedAt.name}`),
            },
        })
        .returning();
};

export const deleteUserMark = async (db: SupportedDb, userId: string, tweetId: TweetId) => {
    return await db
        .delete(userToTweet)
        .where(and(eq(userToTweet.userId, userId), eq(userToTweet.tweetId, tweetId)))
        .returning();
};

export const batchUpsertUserMarks = async (
    db: SupportedDb,
    userId: string,
    marks: { tweetId: TweetId; mark: string }[],
    version: number,
) => {
    if (marks.length === 0) {
        return [];
    }

    const now = new Date();
    const values = marks.map((m) => ({
        userId,
        tweetId: m.tweetId,
        mark: m.mark as (typeof MarkValues)[number],
        lastModifiedVersion: version,
        updatedAt: now,
    }));

    return await db
        .insert(userToTweet)
        .values(values)
        .onConflictDoUpdate({
            target: [userToTweet.userId, userToTweet.tweetId],
            set: {
                mark: sql.raw(`excluded.${userToTweet.mark.name}`),
                lastModifiedVersion: sql.raw(`excluded.${userToTweet.lastModifiedVersion.name}`),
                updatedAt: sql.raw(`excluded.${userToTweet.updatedAt.name}`),
            },
        })
        .returning();
};
