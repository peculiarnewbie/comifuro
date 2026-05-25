import { and, eq, gt } from "drizzle-orm";
import { users, replicacheClients } from "../schema";
import type { SupportedDb } from "./_shared";

export const getUser = async (db: SupportedDb, userId: string) => {
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
