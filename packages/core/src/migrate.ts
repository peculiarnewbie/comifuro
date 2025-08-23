import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from './db';

function runMigrations() {
  console.log('Running migrations...');
  migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations completed!');
}

if (import.meta.main) {
  runMigrations();
}