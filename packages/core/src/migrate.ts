import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getBunSqlite } from "./db";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(
    new URL("../migrations/", import.meta.url)
);

export function runBunMigrations(dbPath: string) {
    const db = getBunSqlite(dbPath);
    console.log("Running migrations...", migrationsFolder, "to", dbPath);
    migrate(db, { migrationsFolder: migrationsFolder });
    console.log("Migrations completed!");
}

if (import.meta.main) {
    runBunMigrations(process.cwd() + "/db.sqlite");
}
