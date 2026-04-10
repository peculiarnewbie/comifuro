import { customAlphabet } from "nanoid";
import { getDb } from ".";
import { users } from "@comifuro/core/schema";
import { eq } from "drizzle-orm";
export const generateUserId = (c) => {
    const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const nanoid = customAlphabet(alphabet, 8);
    let generatedId = nanoid();
    while (checkConflict(generatedId, c)) {
        generatedId = nanoid();
    }
    return generatedId;
};
const checkConflict = async (id, c) => {
    const db = getDb(c);
    const res = await db.select().from(users).where(eq(users.id, id));
    if (res.length > 0)
        return true;
    return false;
};
