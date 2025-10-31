import { Context } from "hono";
import { getDb } from ".";
import { marksOperations, replicacheOperations } from "@comifuro/core";

export const marksPull = async (c: Context, version: number) => {
    const body = await c.req.json();

    console.log({ message: "body", ...body });

    const { cookie, clientGroupID } = body as {
        cookie?: number;
        clientGroupID?: string;
    };

    const noop = {
        patch: [],
    };

    let prevVersion = cookie ?? 0;
    let userId = clientGroupID;

    if (!userId) return c.json(noop);

    const db = getDb(c);
    const userRes = await replicacheOperations.getUser(db, userId);

    if (userRes.length < 1) return c.json(noop);

    const replicacheClients =
        await replicacheOperations.getOutdatedReplicacheClients(
            db,
            userId,
            prevVersion,
        );

    const lastMutationIDChanges = Object.fromEntries(
        replicacheClients.map((x) => [x.id, x.lastMutationId]),
    );

    const tweetsRes = await marksOperations.getUserMarks(
        db,
        userId,
        prevVersion,
    );

    const ops =
        tweetsRes.length > 0
            ? tweetsRes.map((t) => {
                  const { tweetId, ...rest } = t;
                  return {
                      op: "put",
                      key: tweetId,
                      value: rest,
                  };
              })
            : [];

    const res = {
        lastMutationIDChanges,
        cookie: userRes[0].version,
        patch: [...ops],
    };

    return c.json(res);
};
