import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import type { TweetInsert, TweetMediaInsert } from "../types";
import type * as schema from "../schema";

export type SupportedDb = DrizzleD1Database<typeof schema> | SQLiteBunDatabase<typeof schema>;

export type TransactionDb = SupportedDb & {
    transaction: <T>(fn: (tx: SupportedDb) => Promise<T>) => Promise<T>;
};

export type ScrapedTweetUpsert = {
    tweet: TweetInsert;
    media: TweetMediaInsert[];
};
