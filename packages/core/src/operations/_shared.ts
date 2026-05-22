import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import type { TweetInsert, TweetMediaInsert } from "../types";

export type SupportedDb = DrizzleD1Database<any> | SQLiteBunDatabase<any>;

export type HasTransaction = {
    transaction: <T>(fn: (tx: SupportedDb) => Promise<T>) => Promise<T>;
};

export type ScrapedTweetUpsert = {
    tweet: TweetInsert;
    media: TweetMediaInsert[];
};
