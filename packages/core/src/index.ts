import { DrizzleD1Database } from "drizzle-orm/d1";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
    type SQLWrapper,
    and,
    asc,
    desc,
    eq,
    gt,
    inArray,
    lt,
    or,
    sql,
} from "drizzle-orm";
import {
    replicacheClients,
    scraperState,
    tweetMedia,
    tweets,
    users,
    userToTweet,
} from "./schema";
import type {
    ScraperStateInsert,
    TweetClassification,
    TweetInsert,
    TweetMediaInsert,
} from "./types";

type SupportedDb = DrizzleD1Database<any> | BunSQLiteDatabase<any>;

export type ScrapedTweetUpsert = {
    tweet: TweetInsert;
    media: TweetMediaInsert[];
};

export namespace tweetsOperations {
    const effectiveUpdatedAt = sql<number>`coalesce(${tweets.updatedAt}, ${tweets.createdAt})`;
    const excludedColumn = (column: { name: string }) =>
        sql.raw(`excluded.${column.name}`);
    const classificationRank = (value: SQLWrapper) =>
        sql<number>`case
            when ${value} = 'catalogue' then 3
            when ${value} = 'unknown' then 2
            when ${value} = 'error' then 1
            when ${value} = 'not_catalogue' then 0
            else 0
        end`;
    const maxImageMask = sql<number>`case
        when ${tweets.imageMask} > ${excludedColumn(tweets.imageMask)}
            then ${tweets.imageMask}
        else ${excludedColumn(tweets.imageMask)}
    end`;
    const preferredClassification = sql<TweetClassification>`case
        when ${classificationRank(tweets.classification)} >= ${classificationRank(
            excludedColumn(tweets.classification),
        )}
            then ${tweets.classification}
        else ${excludedColumn(tweets.classification)}
    end`;
    const shouldPreferIncomingClassification = sql<boolean>`
        ${classificationRank(excludedColumn(tweets.classification))} >= ${classificationRank(
            tweets.classification,
        )}
    `;
    const buildTweetUpsertSet = () => ({
        user: excludedColumn(tweets.user),
        eventId: excludedColumn(tweets.eventId),
        displayName: excludedColumn(tweets.displayName),
        timestamp: excludedColumn(tweets.timestamp),
        text: excludedColumn(tweets.text),
        tweetUrl: excludedColumn(tweets.tweetUrl),
        searchQuery: excludedColumn(tweets.searchQuery),
        matchedTags: excludedColumn(tweets.matchedTags),
        imageMask: maxImageMask,
        classification: preferredClassification,
        classificationReason: sql<string | null>`case
            when ${shouldPreferIncomingClassification}
                then coalesce(${excludedColumn(tweets.classificationReason)}, ${tweets.classificationReason})
            else ${tweets.classificationReason}
        end`,
        classifierPromptVersion: sql<string | null>`case
            when ${shouldPreferIncomingClassification}
                then coalesce(${excludedColumn(tweets.classifierPromptVersion)}, ${tweets.classifierPromptVersion})
            else ${tweets.classifierPromptVersion}
        end`,
        inferredFandoms: excludedColumn(tweets.inferredFandoms),
        inferredBoothId: excludedColumn(tweets.inferredBoothId),
        rootTweetId: sql<string | null>`coalesce(${excludedColumn(tweets.rootTweetId)}, ${tweets.rootTweetId})`,
        parentTweetId: sql<string | null>`coalesce(${excludedColumn(tweets.parentTweetId)}, ${tweets.parentTweetId})`,
        threadPosition: sql<number | null>`coalesce(${excludedColumn(tweets.threadPosition)}, ${tweets.threadPosition})`,
        updatedAt: excludedColumn(tweets.updatedAt),
        deleted: excludedColumn(tweets.deleted),
    });

    export const getTweet = async (
        db: SupportedDb,
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
        db: SupportedDb,
        tweet: TweetInsert,
    ) => {
        return await db.insert(tweets).values(tweet).returning();
    };

    export const upsertTweet = async (
        db: SupportedDb,
        tweet: TweetInsert,
    ) => {
        return await db
            .insert(tweets)
            .values(tweet)
            .onConflictDoUpdate({
                target: tweets.id,
                set: buildTweetUpsertSet(),
            })
            .returning();
    };

    export const upsertMultipleTweets = async (
        db: SupportedDb,
        tweetsInsert: TweetInsert[],
    ) => {
        if (tweetsInsert.length === 0) {
            return [];
        }

        return await db
            .insert(tweets)
            .values(tweetsInsert)
            .onConflictDoUpdate({
                target: tweets.id,
                set: buildTweetUpsertSet(),
            })
            .returning();
    };

    export const replaceTweetMedia = async (
        db: SupportedDb,
        tweetId: string,
        media: TweetMediaInsert[],
    ) => {
        await db.delete(tweetMedia).where(eq(tweetMedia.tweetId, tweetId));

        if (media.length === 0) {
            return [];
        }

        return await db.insert(tweetMedia).values(media).returning();
    };

    export const upsertScrapedTweet = async (
        db: SupportedDb,
        input: ScrapedTweetUpsert,
    ) => {
        const [tweet] = await upsertTweet(db, input.tweet);
        if (input.media.length > 0) {
            await replaceTweetMedia(db, input.tweet.id, input.media);
        }
        return tweet;
    };

    export const listTweetMedia = async (db: SupportedDb, tweetId: string) => {
        return await db
            .select()
            .from(tweetMedia)
            .where(eq(tweetMedia.tweetId, tweetId))
            .orderBy(tweetMedia.mediaIndex);
    };

    export const listTweetMediaByTweetIds = async (
        db: SupportedDb,
        tweetIds: string[],
    ) => {
        if (tweetIds.length === 0) {
            return [];
        }

        // D1 has a maximum of 100 bound parameters per statement.
        // Chunk the IDs to stay within that limit.
        const CHUNK_SIZE = 100;
        const allResults = [];
        for (let i = 0; i < tweetIds.length; i += CHUNK_SIZE) {
            const chunk = tweetIds.slice(i, i + CHUNK_SIZE);
            const results = await db
                .select()
                .from(tweetMedia)
                .where(inArray(tweetMedia.tweetId, chunk))
                .orderBy(tweetMedia.tweetId, tweetMedia.mediaIndex);
            allResults.push(...results);
        }
        return allResults;
    };

    export const listPublicTweets = async (
        db: SupportedDb,
        classification: TweetClassification = "catalogue",
        eventId?: string,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(
                eventId
                    ? and(
                          eq(tweets.classification, classification),
                          gt(tweets.imageMask, 0),
                          eq(tweets.eventId, eventId),
                      )
                    : and(
                          eq(tweets.classification, classification),
                          gt(tweets.imageMask, 0),
                      ),
            )
            .orderBy(desc(tweets.id));
    };

    export const listPublicTweetMedia = async (
        db: SupportedDb,
        tweetIds: string[],
    ) => {
        if (tweetIds.length === 0) {
            return [];
        }

        // D1 has a maximum of 100 bound parameters per statement.
        // Chunk the IDs to stay within that limit.
        const CHUNK_SIZE = 100;
        const allResults = [];
        for (let i = 0; i < tweetIds.length; i += CHUNK_SIZE) {
            const chunk = tweetIds.slice(i, i + CHUNK_SIZE);
            const results = await db
                .select()
                .from(tweetMedia)
                .where(inArray(tweetMedia.tweetId, chunk))
                .orderBy(tweetMedia.tweetId, tweetMedia.mediaIndex);
            allResults.push(...results);
        }
        return allResults;
    };

    export const listTweetsForSync = async (
        db: SupportedDb,
        {
            eventId,
            cursor,
            limit,
        }: {
            eventId: string;
            cursor?: {
                updatedAt: number;
                id: string;
            };
            limit: number;
        },
    ) => {
        const baseQuery = db
            .select()
            .from(tweets)
            .where(
                and(
                    eq(tweets.eventId, eventId),
                    cursor
                        ? or(
                              gt(effectiveUpdatedAt, cursor.updatedAt),
                              and(
                                  eq(effectiveUpdatedAt, cursor.updatedAt),
                                  gt(tweets.id, cursor.id),
                              ),
                          )
                        : undefined,
                ),
            );

        return await baseQuery
            .orderBy(asc(effectiveUpdatedAt), asc(tweets.id))
            .limit(limit);
    };

    export const listTweetImages = async (
        db: SupportedDb,
        rows: {
            id: string;
            imageMask: number;
        }[],
    ) => {
        const media = await listTweetMediaByTweetIds(
            db,
            rows.map((row) => row.id),
        );

        const mediaByTweet = new Map<string, string[]>();
        for (const item of media) {
            const current = mediaByTweet.get(item.tweetId) ?? [];
            current.push(item.r2Key);
            mediaByTweet.set(item.tweetId, current);
        }

        return new Map(
            rows.map((row) => [
                row.id,
                mediaByTweet.get(row.id) ?? maskToFallbackR2Keys(row.id, row.imageMask),
            ]),
        );
    };

    export const selectTweets = async (
        db: SupportedDb,
        opt?: {
            offset?: number;
            limit?: number;
            eventId?: string;
        },
    ) => {
        const { offset = 0, limit = 100, eventId } = opt || {};
        const query = db.select().from(tweets);

        return await (eventId
            ? query.where(eq(tweets.eventId, eventId))
            : query
        )
            .orderBy(desc(tweets.id))
            .limit(limit)
            .offset(offset);
    };

    export const getNewestTweet = async (db: SupportedDb, eventId?: string) => {
        const query = db.select().from(tweets);

        return await (eventId
            ? query.where(eq(tweets.eventId, eventId))
            : query
        )
            .orderBy(desc(tweets.id))
            .limit(1);
    };

    export const getNewerTweets = async (
        db: SupportedDb,
        newestTweet: string,
        limit = 100,
        eventId?: string,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(
                eventId
                    ? and(
                          gt(tweets.id, newestTweet),
                          eq(tweets.eventId, eventId),
                      )
                    : gt(tweets.id, newestTweet),
            )
            .orderBy(desc(tweets.id))
            .limit(limit);
    };

    export const getOlderTweets = async (
        db: SupportedDb,
        oldestTweet: string,
        limit = 100,
        eventId?: string,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(
                eventId
                    ? and(
                          lt(tweets.id, oldestTweet),
                          eq(tweets.eventId, eventId),
                      )
                    : lt(tweets.id, oldestTweet),
            )
            .orderBy(desc(tweets.id))
            .limit(limit);
    };
}

export namespace marksOperations {
    export const getUserMarks = async (
        db: SupportedDb,
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

function maskToFallbackR2Keys(tweetId: string, mask: number, maxBits = 8) {
    const keys: string[] = [];

    for (let index = 0; index < maxBits; index += 1) {
        if ((mask & (1 << index)) !== 0) {
            keys.push(`${tweetId}/${index}.webp`);
        }
    }

    return keys;
}

export namespace replicacheOperations {
    export const getUser = async (
        db: SupportedDb,
        userId: string,
    ) => {
        return await db.select().from(users).where(eq(users.id, userId));
    };

    export const getOutdatedReplicacheClients = async (
        db: SupportedDb,
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

export namespace scraperOperations {
    export const getState = async (db: SupportedDb, id: string) => {
        const rows = await db
            .select()
            .from(scraperState)
            .where(eq(scraperState.id, id))
            .limit(1);

        return rows[0];
    };

    export const upsertState = async (
        db: SupportedDb,
        state: ScraperStateInsert,
    ) => {
        return await db
            .insert(scraperState)
            .values(state)
            .onConflictDoUpdate({
                target: scraperState.id,
                set: {
                    lastSeenTweetId: sql.raw(
                        `excluded.${scraperState.lastSeenTweetId.name}`,
                    ),
                    lastRunAt: sql.raw(`excluded.${scraperState.lastRunAt.name}`),
                    updatedAt: sql.raw(
                        `excluded.${scraperState.updatedAt.name}`,
                    ),
                },
            })
            .returning();
    };
}
