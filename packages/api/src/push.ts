import { type Context } from "hono";
import { getDb } from ".";
import { ReplicacheClientSelect } from "@comifuro/core/types";
import { replicacheClients } from "@comifuro/core/schema";
import { eq } from "drizzle-orm";

export const marksPush = async (c: Context, version: number) => {
    let errorMode = false;
    type ReplicachePushBody = {
        profileID: string;
        clientGroupID: string;
        mutations: {
            id: number;
            name: string;
            args: any;
            timestamp: number;
            clientID: string;
        }[];
        pushVersion: number;
        schemaVersion: string;
    };
    const body: ReplicachePushBody = await c.req.json();
    console.log({ message: "body", ...body });
    console.log("profile id:", body.profileID);
    console.log("client group id:", body.clientGroupID);
    console.log({
        message: "last mutation:",
        ...body.mutations[body.mutations.length - 1],
    });

    const db = getDb(c);

    for (const mutation of body.mutations) {
        let nextMutationID = 0;

        let client: ReplicacheClientSelect | null = null;
        const clientRes = await db
            .select()
            .from(replicacheClients)
            .where(eq(replicacheClients.id, mutation.clientID))
            .limit(1);

        if (clientRes.length === 0) {
            client = {
                id: mutation.clientID,
                userId: clientRes[0].userId,
                lastMutationId: 0,
                lastModifiedVersion: 0,
            };
        } else {
            client = clientRes[0];
        }
    }

    // TODO: check if user owns client group
    // if it isn't found, register client group to user, link to user if they're logged in

    // TODO: verify clientGroupID owns mutation.clientId

    return c.json(body);
};
