import { tweets, users, userPostRelations } from "./schema";

export type TweetInsert = typeof tweets.$inferInsert;
export type TweetSelect = typeof tweets.$inferSelect;

export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect;

export type UserPostRelationInsert = typeof userPostRelations.$inferInsert;
export type UserPostRelationSelect = typeof userPostRelations.$inferSelect;
