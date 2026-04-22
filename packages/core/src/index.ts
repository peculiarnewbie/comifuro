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
    isNull,
    lt,
    or,
    sql,
} from "drizzle-orm";
import {
    booths,
    replicacheClients,
    scraperState,
    tweetMedia,
    tweets,
    users,
    userToTweet,
    MarkValues,
} from "./schema";
import type {
    BoothInsert,
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
        inferredFandomsConfidence: excludedColumn(tweets.inferredFandomsConfidence),
        inferredBoothId: excludedColumn(tweets.inferredBoothId),
        inferredBoothIdConfidence: excludedColumn(tweets.inferredBoothIdConfidence),
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
        return (db as any).transaction(async (tx: SupportedDb) => {
            const [tweet] = await upsertTweet(tx, input.tweet);
            if (input.media.length > 0) {
                await replaceTweetMedia(tx, input.tweet.id, input.media);
            }
            return tweet;
        });
    };

    export const listTweetMedia = async (db: SupportedDb, tweetId: string) => {
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
            cursor?: { tweetId: string; mediaIndex: number };
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
            tweetId: string;
            mediaIndex: number;
            thumbnailR2Key: string;
        },
    ) => {
        return await db
            .update(tweetMedia)
            .set({ thumbnailR2Key: input.thumbnailR2Key })
            .where(
                and(
                    eq(tweetMedia.tweetId, input.tweetId),
                    eq(tweetMedia.mediaIndex, input.mediaIndex),
                ),
            )
            .returning();
    };

    export const listThreadTweets = async (
        db: SupportedDb,
        rootTweetId: string,
    ) => {
        return await db
            .select()
            .from(tweets)
            .where(
                or(eq(tweets.id, rootTweetId), eq(tweets.rootTweetId, rootTweetId)),
            )
            .orderBy(asc(tweets.threadPosition), asc(tweets.id));
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

    export type TweetImageRef = {
        r2Key: string;
        thumbnailR2Key: string | null;
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

        const mediaByTweet = new Map<string, TweetImageRef[]>();
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
                mediaByTweet.get(row.id) ?? maskToFallbackImageRefs(row.id, row.imageMask),
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

    export const updateTweetAdminMetadata = async (
        db: SupportedDb,
        input: {
            id: string;
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
            id: string;
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
            rootTweetId: string;
            newRootTweetId: string;
            updatedAt?: Date;
        },
    ) => {
        const updatedAt = input.updatedAt ?? new Date();

        return (db as any).transaction(async (tx: SupportedDb) => {
            const threadTweets = await tx
                .select()
                .from(tweets)
                .where(
                    or(
                        eq(tweets.id, input.rootTweetId),
                        eq(tweets.rootTweetId, input.rootTweetId),
                    ),
                )
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
            const newRoot = orderedTweets.find(
                (tweet) => tweet.id === input.newRootTweetId,
            );

            if (!newRoot) {
                throw new Error("new root tweet is not part of the thread");
            }

            const nextOrder = [
                newRoot,
                ...orderedTweets.filter((tweet) => tweet.id !== input.newRootTweetId),
            ];

            for (const [index, tweet] of nextOrder.entries()) {
                const parentTweetId =
                    index === 0 ? null : (nextOrder[index - 1]?.id ?? null);
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

            // Return updated tweets via a final select for reliability
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
}

export namespace boothsOperations {
    function parseSectionFromBoothId(boothId: string): string {
        const match = boothId.match(/^([A-Z]+)/i);
        return match?.[1]?.toUpperCase() ?? "";
    }

    export const upsertBoothFromTweet = async (
        db: SupportedDb,
        tweet: {
            eventId: string;
            inferredBoothId: string | null;
            user: string;
            displayName: string | null;
            id: string;
        },
    ) => {
        if (!tweet.inferredBoothId) {
            return null;
        }

        const now = new Date();
        const section = parseSectionFromBoothId(tweet.inferredBoothId);

        return await db
            .insert(booths)
            .values({
                eventId: tweet.eventId,
                id: tweet.inferredBoothId.toUpperCase(),
                section,
                status: "occupied",
                exhibitorUser: tweet.user,
                exhibitorDisplayName: tweet.displayName,
                primaryTweetId: tweet.id,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [booths.eventId, booths.id],
                set: {
                    section: sql.raw(`excluded.${booths.section.name}`),
                    status: sql.raw(`excluded.${booths.status.name}`),
                    exhibitorUser: sql.raw(
                        `excluded.${booths.exhibitorUser.name}`,
                    ),
                    exhibitorDisplayName: sql.raw(
                        `excluded.${booths.exhibitorDisplayName.name}`,
                    ),
                    primaryTweetId: sql.raw(
                        `excluded.${booths.primaryTweetId.name}`,
                    ),
                    updatedAt: sql.raw(`excluded.${booths.updatedAt.name}`),
                },
            })
            .returning();
    };

    export const listBooths = async (
        db: SupportedDb,
        eventId: string,
        opts?: {
            status?: "unknown" | "available" | "occupied" | "reserved";
            limit?: number;
            offset?: number;
        },
    ) => {
        const conditions = [eq(booths.eventId, eventId)];
        if (opts?.status) {
            conditions.push(eq(booths.status, opts.status));
        }

        const query = db
            .select()
            .from(booths)
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
            .orderBy(asc(booths.id));

        if (opts?.limit) {
            query.limit(opts.limit);
        }
        if (opts?.offset) {
            query.offset(opts.offset);
        }

        return await query;
    };

    export const getBooth = async (
        db: SupportedDb,
        eventId: string,
        id: string,
    ) => {
        const rows = await db
            .select()
            .from(booths)
            .where(and(eq(booths.eventId, eventId), eq(booths.id, id)))
            .limit(1);
        return rows[0] ?? null;
    };

    export const getBoothWithTweets = async (
        db: SupportedDb,
        eventId: string,
        id: string,
    ) => {
        const booth = await getBooth(db, eventId, id);
        if (!booth) {
            return { booth: null, tweets: [] };
        }

        const tweetRows = await db
            .select()
            .from(tweets)
            .where(
                and(
                    eq(tweets.eventId, eventId),
                    eq(tweets.inferredBoothId, id),
                    eq(tweets.classification, "catalogue"),
                ),
            )
            .orderBy(desc(tweets.id));

        return { booth, tweets: tweetRows };
    };

    export const rebuildBoothsFromTweets = async (
        db: SupportedDb,
        eventId: string,
    ) => {
        return (db as any).transaction(async (tx: SupportedDb) => {
            // Delete existing booths for this event
            await tx.delete(booths).where(eq(booths.eventId, eventId));

            // Find all catalogue tweets with a booth ID for this event
            const tweetRows = await tx
                .select()
                .from(tweets)
                .where(
                    and(
                        eq(tweets.eventId, eventId),
                        eq(tweets.classification, "catalogue"),
                        isNull(tweets.deleted),
                        gt(tweets.imageMask, 0),
                    ),
                )
                .orderBy(asc(tweets.id));

            const seenBooths = new Set<string>();
            const inserted: BoothInsert[] = [];

            for (const tweet of tweetRows) {
                if (!tweet.inferredBoothId) {
                    continue;
                }
                const upperBoothId = tweet.inferredBoothId.toUpperCase();
                const key = `${eventId}:${upperBoothId}`;
                if (seenBooths.has(key)) {
                    continue;
                }
                seenBooths.add(key);

                const section = parseSectionFromBoothId(upperBoothId);
                const row: BoothInsert = {
                    eventId,
                    id: upperBoothId,
                    section,
                    status: "occupied",
                    exhibitorUser: tweet.user,
                    exhibitorDisplayName: tweet.displayName,
                    primaryTweetId: tweet.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                await tx.insert(booths).values(row);
                inserted.push(row);
            }

            return inserted;
        });
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

    export const upsertUserMark = async (
        db: SupportedDb,
        input: {
            userId: string;
            tweetId: string;
            mark: string;
            version: number;
        },
    ) => {
        return await db
            .insert(userToTweet)
            .values({
                userId: input.userId,
                tweetId: input.tweetId,
                mark: input.mark as typeof MarkValues[number],
                lastModifiedVersion: input.version,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [userToTweet.userId, userToTweet.tweetId],
                set: {
                    mark: sql.raw(`excluded.${userToTweet.mark.name}`),
                    lastModifiedVersion: sql.raw(
                        `excluded.${userToTweet.lastModifiedVersion.name}`,
                    ),
                    updatedAt: sql.raw(`excluded.${userToTweet.updatedAt.name}`),
                },
            })
            .returning();
    };

    export const deleteUserMark = async (
        db: SupportedDb,
        userId: string,
        tweetId: string,
    ) => {
        return await db
            .delete(userToTweet)
            .where(
                and(
                    eq(userToTweet.userId, userId),
                    eq(userToTweet.tweetId, tweetId),
                ),
            )
            .returning();
    };

    export const batchUpsertUserMarks = async (
        db: SupportedDb,
        userId: string,
        marks: { tweetId: string; mark: string }[],
        version: number,
    ) => {
        if (marks.length === 0) {
            return [];
        }

        const now = new Date();
        const values = marks.map((m) => ({
            userId,
            tweetId: m.tweetId,
            mark: m.mark as typeof MarkValues[number],
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
                    lastModifiedVersion: sql.raw(
                        `excluded.${userToTweet.lastModifiedVersion.name}`,
                    ),
                    updatedAt: sql.raw(`excluded.${userToTweet.updatedAt.name}`),
                },
            })
            .returning();
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

function maskToFallbackImageRefs(
    tweetId: string,
    mask: number,
    maxBits = 8,
): tweetsOperations.TweetImageRef[] {
    const refs: tweetsOperations.TweetImageRef[] = [];

    for (let index = 0; index < maxBits; index += 1) {
        if ((mask & (1 << index)) !== 0) {
            refs.push({
                r2Key: `${tweetId}/${index}.webp`,
                thumbnailR2Key: null,
            });
        }
    }

    return refs;
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
