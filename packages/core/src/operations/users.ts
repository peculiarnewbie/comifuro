import {
    and,
    eq,
    sql,
} from "drizzle-orm";
import {
    userEventMeta,
} from "../schema";
import type { UserId, EventId, BoothId } from "../schema";
import type { SupportedDb } from "./_shared";

export const upsertUserMeta = async (
    db: SupportedDb,
    input: {
        user: UserId;
        eventId: EventId;
        boothId?: BoothId | null;
        preorderDeadline?: string | null;
    },
) => {
    const now = new Date();
    return await db
        .insert(userEventMeta)
        .values({
            user: input.user,
            eventId: input.eventId,
            boothId: input.boothId ?? null,
            preorderDeadline: input.preorderDeadline ?? null,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [userEventMeta.user, userEventMeta.eventId],
            set: {
                boothId: sql.raw(`excluded.${userEventMeta.boothId.name}`),
                preorderDeadline: sql.raw(
                    `excluded.${userEventMeta.preorderDeadline.name}`,
                ),
                updatedAt: sql.raw(`excluded.${userEventMeta.updatedAt.name}`),
            },
        })
        .returning();
};

export const getUserMeta = async (
    db: SupportedDb,
    eventId: EventId,
    user: UserId,
) => {
    const rows = await db
        .select()
        .from(userEventMeta)
        .where(
            and(
                eq(userEventMeta.eventId, eventId),
                eq(userEventMeta.user, user),
            ),
        )
        .limit(1);
    return rows[0] ?? null;
};
