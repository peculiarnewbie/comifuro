import {
    booths,
    items,
    MarkValues,
    replicacheClients,
    scraperState,
    tweetMedia,
    TweetClassificationValues,
    tweets,
    userEventMeta,
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
export type BoothInsert = typeof booths.$inferInsert;
export type BoothSelect = typeof booths.$inferSelect;
export type ItemInsert = typeof items.$inferInsert;
export type ItemSelect = typeof items.$inferSelect;
export type UserEventMetaInsert = typeof userEventMeta.$inferInsert;
export type UserEventMetaSelect = typeof userEventMeta.$inferSelect;

export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect;

export type UserPostRelationInsert = typeof userToTweet.$inferInsert;
export type UserPostRelationSelect = typeof userToTweet.$inferSelect;

export type ReplicacheClientInsert = typeof replicacheClients.$inferInsert;
export type ReplicacheClientSelect = typeof replicacheClients.$inferSelect;

export type Marks = (typeof MarkValues)[number];

export type {
    TweetId,
    UserId,
    EventId,
    BoothId,
    TweetSyncCursor,
    TweetSyncItem,
    TweetSyncResponse,
} from "./schemas";
