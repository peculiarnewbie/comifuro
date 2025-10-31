import type { Context } from "hono";
import { getDb } from ".";
import { TweetSelect } from "@comifuro/core/types";
import { tweetsOperations } from "@comifuro/core";

export const pullTweets = async (c: Context, version: number) => {
    const limit = Number(c.req.query("limit") ?? 500);

    const body = await c.req.json();

    type PullCookie = {
        newestTweet?: string;
        oldestTweet?: string;
        order?: number;
        donePullingTweet?: boolean;
        schemaVersion?: number;
    };

    const { cookie, clientGroupID } = body as {
        cookie: PullCookie;
        clientGroupID: string;
    };

    // change to pull from newest first, but caching both the newest tweets and oldest pulled tweets

    let newestTweet = cookie?.newestTweet;
    let oldestTweet = cookie?.oldestTweet;
    let order = cookie?.order;
    let donePullingTweet = cookie?.donePullingTweet;
    let schemaVersion = cookie?.schemaVersion;

    const preOps = [];

    // TODO: create a migration function
    if (!schemaVersion || schemaVersion < version) {
        console.log("different schema. clearing");
        preOps.push({
            op: "clear",
        });
        newestTweet = "0";
    }

    const db = getDb(c);

    //TODO: check if user owns client group
    //TODO: handle deletion

    let tweetsRows = [] as TweetSelect[];
    if (!newestTweet) {
        console.log("new init");
        tweetsRows = await tweetsOperations.selectTweets(db, { limit });

        const firstTweet = tweetsRows[0];
        const lastTweet = tweetsRows[tweetsRows.length - 1];
        if (firstTweet) {
            newestTweet = firstTweet.id;
            oldestTweet = lastTweet.id;
            donePullingTweet = false;
            preOps.push({
                op: "clear",
            });
        }
    } else {
        const newest = (await tweetsOperations.getNewestTweet(db))[0];

        if (newestTweet < newest.id) {
            console.log("there are newer tweets");
            tweetsRows = await tweetsOperations.getNewerTweets(
                db,
                newestTweet,
                limit,
            );
            const firstTweet = tweetsRows[0];
            if (firstTweet) {
                newestTweet = firstTweet.id;
                donePullingTweet = false;
            }
            const lastTweet = tweetsRows[tweetsRows.length - 1];
            if (!oldestTweet) oldestTweet = lastTweet.id;
        } else {
            console.log("there no newer tweets");
            if (!oldestTweet) {
                oldestTweet = newest.id;
            }
            tweetsRows = await tweetsOperations.getOlderTweets(
                db,
                oldestTweet,
                limit,
            );
            if (tweetsRows.length === 0) {
                donePullingTweet = true;
                console.log("done pulling");
            } else {
                console.log("there are older tweets");
                const lastTweet = tweetsRows[tweetsRows.length - 1];
                oldestTweet = lastTweet.id;
                donePullingTweet = false;
            }
        }
    }

    tweetsRows = tweetsRows.filter((x) => x.imageMask > 0);

    const ops =
        tweetsRows.length > 0
            ? tweetsRows.map((t) => {
                  const { id, ...rest } = t;
                  return {
                      op: "put",
                      key: id,
                      value: rest,
                  };
              })
            : [];

    let newOrder: number | undefined;
    if (!order) {
        newOrder = 1;
    } else if (!donePullingTweet) {
        newOrder = order + 1;
    }

    const newCookie = {
        newestTweet,
        oldestTweet,
        donePullingTweet,
        order: newOrder ?? order,
        schemaVersion: version,
    } satisfies PullCookie;

    const res = {
        lastMutationIDChanges: {},
        cookie: newCookie,
        patch: [...preOps, ...ops],
    };
    return c.json(res);
};
