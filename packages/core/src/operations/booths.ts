import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { booths, tweets } from "../schema";
import { BoothId } from "../schema";
import type { EventId, TweetId, UserId } from "../schema";
import * as Schema from "effect/Schema";
import type { BoothInsert } from "../types";
import type { SupportedDb, TransactionDb } from "./_shared";

function parseSectionFromBoothId(boothId: string): string {
    const match = boothId.match(/^([A-Z]+)/i);
    return match?.[1]?.toUpperCase() ?? "";
}

export const upsertBoothFromTweet = async (
    db: SupportedDb,
    tweet: {
        eventId: EventId;
        inferredBoothId: BoothId | null;
        user: UserId;
        displayName: string | null;
        id: TweetId;
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
            id: Schema.decodeUnknownSync(BoothId)(tweet.inferredBoothId.toUpperCase()),
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
                exhibitorUser: sql.raw(`excluded.${booths.exhibitorUser.name}`),
                exhibitorDisplayName: sql.raw(`excluded.${booths.exhibitorDisplayName.name}`),
                primaryTweetId: sql.raw(`excluded.${booths.primaryTweetId.name}`),
                updatedAt: sql.raw(`excluded.${booths.updatedAt.name}`),
            },
        })
        .returning();
};

export const listBooths = async (
    db: SupportedDb,
    eventId: EventId,
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

export const getBooth = async (db: SupportedDb, eventId: EventId, id: BoothId) => {
    const rows = await db
        .select()
        .from(booths)
        .where(and(eq(booths.eventId, eventId), eq(booths.id, id)))
        .limit(1);
    return rows[0] ?? null;
};

export const getBoothWithTweets = async (db: SupportedDb, eventId: EventId, id: BoothId) => {
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

// Both D1 and bun:sqlite Drizzle instances support .transaction();
// the TransactionDb cast is safe at runtime.
export const rebuildBoothsFromTweets = async (db: SupportedDb, eventId: EventId) => {
    return (db as TransactionDb).transaction(async (tx) => {
        await tx.delete(booths).where(eq(booths.eventId, eventId));

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
                id: Schema.decodeUnknownSync(BoothId)(upperBoothId),
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
