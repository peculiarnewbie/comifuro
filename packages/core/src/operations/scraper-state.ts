import { eq, sql } from "drizzle-orm";
import { scraperState } from "../schema";
import type { ScraperStateInsert } from "../types";
import type { SupportedDb } from "./_shared";

export const getState = async (db: SupportedDb, id: string) => {
    const rows = await db.select().from(scraperState).where(eq(scraperState.id, id)).limit(1);

    return rows[0];
};

export const upsertState = async (db: SupportedDb, state: ScraperStateInsert) => {
    return await db
        .insert(scraperState)
        .values(state)
        .onConflictDoUpdate({
            target: scraperState.id,
            set: {
                checkpoint: sql.raw(`excluded.${scraperState.checkpoint.name}`),
                startTweetId: sql.raw(`excluded.${scraperState.startTweetId.name}`),
                endTweetId: sql.raw(`excluded.${scraperState.endTweetId.name}`),
                lastSeenTweetId: sql.raw(`excluded.${scraperState.lastSeenTweetId.name}`),
                lastRunAt: sql.raw(`excluded.${scraperState.lastRunAt.name}`),
                updatedAt: sql.raw(`excluded.${scraperState.updatedAt.name}`),
            },
        })
        .returning();
};
