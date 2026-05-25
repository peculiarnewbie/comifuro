import { and, eq } from "drizzle-orm";
import { items } from "../schema";
import type { EventId, UserId, TweetId } from "../schema";
import type { SupportedDb } from "./_shared";

export const replaceUserItems = async (
    db: SupportedDb,
    input: {
        eventId: EventId;
        user: UserId;
        sourceTweetId: TweetId;
        items: { type: string; price?: string | null; fandom?: string | null }[];
    },
) => {
    const now = new Date();
    await db.delete(items).where(and(eq(items.eventId, input.eventId), eq(items.user, input.user)));

    if (input.items.length === 0) {
        return [];
    }

    return await db
        .insert(items)
        .values(
            input.items.map((item) => ({
                eventId: input.eventId,
                user: input.user,
                sourceTweetId: input.sourceTweetId,
                type: item.type,
                price: item.price ?? null,
                fandom: item.fandom ?? null,
                createdAt: now,
                updatedAt: now,
            })),
        )
        .returning();
};

export const listUserItems = async (db: SupportedDb, eventId: EventId, user: UserId) => {
    return await db
        .select()
        .from(items)
        .where(and(eq(items.eventId, eventId), eq(items.user, user)))
        .orderBy(items.type);
};

export const listItemsByEvent = async (db: SupportedDb, eventId: EventId) => {
    return await db
        .select()
        .from(items)
        .where(eq(items.eventId, eventId))
        .orderBy(items.user, items.type);
};
