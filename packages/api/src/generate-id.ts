import { DrizzleD1Database } from "drizzle-orm/d1";
import { customAlphabet } from "nanoid";
import { Context } from "hono";
import { getDb } from ".";
import { users } from "@comifuro/core/schema";
import { eq } from "drizzle-orm";

export const generateUserId = (c: Context) => {
    const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const nanoid = customAlphabet(alphabet, 8);
    let generatedId = nanoid();
    while (checkConflict(generatedId, c)) {
        generatedId = nanoid();
    }
    return generatedId;
};

const checkConflict = async (id: string, c: Context) => {
    const db = getDb(c);
    const res = await db.select().from(users).where(eq(users.id, id));
    if (res.length > 0) return true;
    return false;
};
