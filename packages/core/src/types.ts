import {
    MarkValues,
    replicacheClients,
    scraperState,
    tweetMedia,
    TweetClassificationValues,
    tweets,
    users,
    userToTweet,
} from "./schema";

export type TweetInsert = typeof tweets.$inferInsert;
export type TweetSelect = typeof tweets.$inferSelect;
export type TweetMediaInsert = typeof tweetMedia.$inferInsert;
export type TweetMediaSelect = typeof tweetMedia.$inferSelect;
export type ScraperStateInsert = typeof scraperState.$inferInsert;
export type ScraperStateSelect = typeof scraperState.$inferSelect;
export type TweetClassification = (typeof TweetClassificationValues)[number];

export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect;

export type UserPostRelationInsert = typeof userToTweet.$inferInsert;
export type UserPostRelationSelect = typeof userToTweet.$inferSelect;

export type ReplicacheClientInsert = typeof replicacheClients.$inferInsert;
export type ReplicacheClientSelect = typeof replicacheClients.$inferSelect;

export type Marks = (typeof MarkValues)[number];

export type TweetSyncCursor = {
    updatedAt: number;
    id: string;
};

export type TweetSyncItem = {
    id: string;
    eventId: string;
    user: string;
    displayName: string | null;
    timestamp: number;
    text: string;
    tweetUrl: string;
    imageMask: number;
    classification: TweetClassification;
    inferredFandoms: string[];
    inferredBoothId: string | null;
    rootTweetId: string | null;
    parentTweetId: string | null;
    threadPosition: number | null;
    updatedAt: number;
    deleted: boolean;
    images: string[];
};

export type TweetSyncResponse = {
    eventId: string;
    syncToken: string;
    items: TweetSyncItem[];
    nextCursor: TweetSyncCursor | null;
    hasMore: boolean;
    serverTime: number;
};
