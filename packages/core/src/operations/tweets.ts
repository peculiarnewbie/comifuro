import { type SQLWrapper, and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { tweets, tweetMedia, TweetClassificationValues } from "../schema";
import type { TweetId, EventId } from "../schema";
import type { TweetClassification, TweetInsert, TweetMediaInsert } from "../types";
import type { SupportedDb, TransactionDb, ScrapedTweetUpsert } from "./_shared";
import { getFallbackImageRefs } from "../helpers";
import type { FallbackImageRef } from "../helpers";

const excludedColumn = (column: { name: string }) => sql.raw(`excluded.${column.name}`);

// Higher rank wins on conflict. Every classification value must have an entry —
// TypeScript errors if a new value is added to TweetClassificationValues without a rank here.
const classificationRankMap: Record<(typeof TweetClassificationValues)[number], number> = {
    catalogue: 3,
    unknown: 2,
    error: 1,
    not_catalogue: 0,
};

const classificationRank = (value: SQLWrapper) => {
    const entries = Object.entries(classificationRankMap) as [
        (typeof TweetClassificationValues)[number],
        number,
    ][];
    let query = sql<number>`case`;
    for (const [label, rank] of entries) {
        query = sql`${query} when ${value} = ${label} then ${rank}`;
    }
    return sql`${query} else 0 end`;
};

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
    inferredFandomsConfidence: excludedColumn(tweets.inferredFandomsConfidence),
    inferredBoothId: excludedColumn(tweets.inferredBoothId),
    inferredBoothIdConfidence: excludedColumn(tweets.inferredBoothIdConfidence),
    inferredItemTypes: excludedColumn(tweets.inferredItemTypes),
    rootTweetId: sql<
        string | null
    >`coalesce(${excludedColumn(tweets.rootTweetId)}, ${tweets.rootTweetId})`,
    parentTweetId: sql<
        string | null
    >`coalesce(${excludedColumn(tweets.parentTweetId)}, ${tweets.parentTweetId})`,
    threadPosition: sql<
        number | null
    >`coalesce(${excludedColumn(tweets.threadPosition)}, ${tweets.threadPosition})`,
    updatedAt: excludedColumn(tweets.updatedAt),
    deleted: excludedColumn(tweets.deleted),
});

export const getTweet = async (db: SupportedDb, id: TweetId) => {
    const tweet = await db.select().from(tweets).where(eq(tweets.id, id)).limit(1);
    return tweet[0];
};

export const insertTweet = async (db: SupportedDb, tweet: TweetInsert) => {
    return await db.insert(tweets).values(tweet).returning();
};

export const upsertTweet = async (db: SupportedDb, tweet: TweetInsert) => {
    return await db
        .insert(tweets)
        .values(tweet)
        .onConflictDoUpdate({
            target: tweets.id,
            set: buildTweetUpsertSet(),
        })
        .returning();
};

export const upsertMultipleTweets = async (db: SupportedDb, tweetsInsert: TweetInsert[]) => {
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
    tweetId: TweetId,
    media: TweetMediaInsert[],
) => {
    await db.delete(tweetMedia).where(eq(tweetMedia.tweetId, tweetId));

    if (media.length === 0) {
        return [];
    }

    return await db.insert(tweetMedia).values(media).returning();
};

export const upsertScrapedTweet = async (db: SupportedDb, input: ScrapedTweetUpsert) => {
    const [tweet] = await upsertTweet(db, input.tweet);
    if (input.media.length > 0) {
        await replaceTweetMedia(db, input.tweet.id, input.media);
    }
    return tweet;
};

export const listTweetMedia = async (db: SupportedDb, tweetId: TweetId) => {
    return await db
        .select()
        .from(tweetMedia)
        .where(eq(tweetMedia.tweetId, tweetId))
        .orderBy(tweetMedia.mediaIndex);
};

export const listTweetMediaMissingThumbnails = async (
    db: SupportedDb,
    opts: {
        limit: number;
        cursor?: { tweetId: TweetId; mediaIndex: number };
    },
) => {
    const { limit, cursor } = opts;
    const condition = cursor
        ? and(
              isNull(tweetMedia.thumbnailR2Key),
              or(
                  gt(tweetMedia.tweetId, cursor.tweetId),
                  and(
                      eq(tweetMedia.tweetId, cursor.tweetId),
                      gt(tweetMedia.mediaIndex, cursor.mediaIndex),
                  ),
              ),
          )
        : isNull(tweetMedia.thumbnailR2Key);

    return await db
        .select()
        .from(tweetMedia)
        .where(condition)
        .orderBy(asc(tweetMedia.tweetId), asc(tweetMedia.mediaIndex))
        .limit(limit);
};

export const setTweetMediaThumbnail = async (
    db: SupportedDb,
    input: {
        tweetId: TweetId;
        mediaIndex: number;
        thumbnailR2Key: string;
    },
) => {
    return await db
        .update(tweetMedia)
        .set({ thumbnailR2Key: input.thumbnailR2Key })
        .where(
            and(eq(tweetMedia.tweetId, input.tweetId), eq(tweetMedia.mediaIndex, input.mediaIndex)),
        )
        .returning();
};

export const listThreadTweets = async (db: SupportedDb, rootTweetId: TweetId) => {
    return await db
        .select()
        .from(tweets)
        .where(or(eq(tweets.id, rootTweetId), eq(tweets.rootTweetId, rootTweetId)))
        .orderBy(asc(tweets.threadPosition), asc(tweets.id));
};

export const listTweetMediaByTweetIds = async (db: SupportedDb, tweetIds: TweetId[]) => {
    if (tweetIds.length === 0) {
        return [];
    }

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
    eventId?: EventId,
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
                : and(eq(tweets.classification, classification), gt(tweets.imageMask, 0)),
        )
        .orderBy(desc(tweets.id));
};

export const listPublicTweetMedia = async (db: SupportedDb, tweetIds: TweetId[]) => {
    if (tweetIds.length === 0) {
        return [];
    }

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
        eventId: EventId;
        cursor?: {
            updatedAt: number;
            id: TweetId;
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
                          gt(tweets.updatedAt, new Date(cursor.updatedAt)),
                          and(
                              eq(tweets.updatedAt, new Date(cursor.updatedAt)),
                              gt(tweets.id, cursor.id),
                          ),
                      )
                    : undefined,
            ),
        );

    return await baseQuery.orderBy(asc(tweets.updatedAt), asc(tweets.id)).limit(limit);
};

export const listTweetImages = async (
    db: SupportedDb,
    rows: {
        id: TweetId;
        imageMask: number;
    }[],
) => {
    const media = await listTweetMediaByTweetIds(
        db,
        rows.map((row) => row.id),
    );

    const mediaByTweet = new Map<TweetId, FallbackImageRef[]>();
    for (const item of media) {
        const current = mediaByTweet.get(item.tweetId) ?? [];
        current.push({
            r2Key: item.r2Key,
            thumbnailR2Key: item.thumbnailR2Key ?? null,
        });
        mediaByTweet.set(item.tweetId, current);
    }

    return new Map(
        rows.map((row) => [
            row.id,
            mediaByTweet.get(row.id) ?? getFallbackImageRefs(row.id, row.imageMask),
        ]),
    );
};

export const selectTweets = async (
    db: SupportedDb,
    opt?: {
        offset?: number;
        limit?: number;
        eventId?: EventId;
    },
) => {
    const { offset = 0, limit = 100, eventId } = opt || {};
    const query = db.select().from(tweets);

    return await (eventId ? query.where(eq(tweets.eventId, eventId)) : query)
        .orderBy(desc(tweets.id))
        .limit(limit)
        .offset(offset);
};

export const getNewestTweet = async (db: SupportedDb, eventId?: EventId) => {
    const query = db.select().from(tweets);

    return await (eventId ? query.where(eq(tweets.eventId, eventId)) : query)
        .orderBy(desc(tweets.id))
        .limit(1);
};

export const getNewerTweets = async (
    db: SupportedDb,
    opts: {
        newerThan: TweetId;
        limit?: number;
        eventId?: EventId;
    },
) => {
    const { newerThan, limit = 100, eventId } = opts;
    return await db
        .select()
        .from(tweets)
        .where(
            eventId
                ? and(gt(tweets.id, newerThan), eq(tweets.eventId, eventId))
                : gt(tweets.id, newerThan),
        )
        .orderBy(desc(tweets.id))
        .limit(limit);
};

export const getOlderTweets = async (
    db: SupportedDb,
    opts: {
        olderThan: TweetId;
        limit?: number;
        eventId?: EventId;
    },
) => {
    const { olderThan, limit = 100, eventId } = opts;
    return await db
        .select()
        .from(tweets)
        .where(
            eventId
                ? and(lt(tweets.id, olderThan), eq(tweets.eventId, eventId))
                : lt(tweets.id, olderThan),
        )
        .orderBy(desc(tweets.id))
        .limit(limit);
};

export const updateTweetAdminMetadata = async (
    db: SupportedDb,
    input: {
        id: TweetId;
        matchedTags?: string[];
        inferredFandoms?: string[];
        updatedAt?: Date;
    },
) => {
    const updatedAt = input.updatedAt ?? new Date();

    return await db
        .update(tweets)
        .set({
            matchedTags: input.matchedTags,
            inferredFandoms: input.inferredFandoms,
            updatedAt,
        })
        .where(eq(tweets.id, input.id))
        .returning();
};

export const manualUncatalogueTweet = async (
    db: SupportedDb,
    input: {
        id: TweetId;
        reason: string;
        updatedAt?: Date;
    },
) => {
    const updatedAt = input.updatedAt ?? new Date();

    return await db
        .update(tweets)
        .set({
            classification: "not_catalogue",
            classificationReason: input.reason,
            rootTweetId: null,
            parentTweetId: null,
            threadPosition: null,
            updatedAt,
        })
        .where(eq(tweets.id, input.id))
        .returning();
};

export const rerootThread = async (
    db: SupportedDb,
    input: {
        rootTweetId: TweetId;
        newRootTweetId: TweetId;
        updatedAt?: Date;
    },
) => {
    const updatedAt = input.updatedAt ?? new Date();

    return (db as TransactionDb).transaction(async (tx) => {
        const threadTweets = await tx
            .select()
            .from(tweets)
            .where(or(eq(tweets.id, input.rootTweetId), eq(tweets.rootTweetId, input.rootTweetId)))
            .orderBy(asc(tweets.threadPosition), asc(tweets.id));

        const orderedTweets = threadTweets.sort((left, right) => {
            const leftPosition =
                left.id === input.rootTweetId
                    ? 0
                    : (left.threadPosition ?? Number.MAX_SAFE_INTEGER) + 1;
            const rightPosition =
                right.id === input.rootTweetId
                    ? 0
                    : (right.threadPosition ?? Number.MAX_SAFE_INTEGER) + 1;

            if (leftPosition !== rightPosition) {
                return leftPosition - rightPosition;
            }

            if (left.id === right.id) {
                return 0;
            }

            return BigInt(left.id) > BigInt(right.id) ? 1 : -1;
        });
        const newRoot = orderedTweets.find((tweet) => tweet.id === input.newRootTweetId);

        if (!newRoot) {
            throw new Error("new root tweet is not part of the thread");
        }

        const nextOrder = [
            newRoot,
            ...orderedTweets.filter((tweet) => tweet.id !== input.newRootTweetId),
        ];

        for (const [index, tweet] of nextOrder.entries()) {
            const parentTweetId = index === 0 ? null : (nextOrder[index - 1]?.id ?? null);
            await tx
                .update(tweets)
                .set({
                    classification: "catalogue",
                    rootTweetId: index === 0 ? null : input.newRootTweetId,
                    parentTweetId,
                    threadPosition: index === 0 ? null : index,
                    updatedAt,
                })
                .where(eq(tweets.id, tweet.id));
        }

        return tx
            .select()
            .from(tweets)
            .where(
                or(
                    eq(tweets.id, input.newRootTweetId),
                    eq(tweets.rootTweetId, input.newRootTweetId),
                ),
            )
            .orderBy(asc(tweets.threadPosition), asc(tweets.id));
    });
};
