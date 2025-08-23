import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

export const getBunSqlite = (dbPath: string) => {
    const sqlite = new Database(dbPath);
    return drizzle(sqlite, { schema });
};
