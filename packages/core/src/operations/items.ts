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
    const condition = and(
        eq(items.eventId, input.eventId),
        eq(items.user, input.user),
        eq(items.sourceTweetId, input.sourceTweetId),
    );
    const values = input.items.map((item) => ({
        eventId: input.eventId,
        user: input.user,
        sourceTweetId: input.sourceTweetId,
        type: item.type,
        price: item.price ?? null,
        fandom: item.fandom ?? null,
        createdAt: new Date(),
    }));
    if ("batch" in db) {
        const remove = db.delete(items).where(condition);
        if (!values.length) {
            await remove;
            return [];
        }
        const [, ...rows] = await db.batch([
            remove,
            ...values.map((value) => db.insert(items).values(value).returning()),
        ]);
        return rows.flat();
    }
    return db.transaction((tx) => {
        tx.delete(items).where(condition).run();
        return values.length ? tx.insert(items).values(values).returning().all() : [];
    });
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
