import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { upsertScrapedTweet, getTweet, listTweetMedia, rerootThread } from "./operations/tweets";
import { replaceUserItems, listUserItems } from "./operations/items";
import { rebuildBoothsFromTweets } from "./operations/booths";
import { upsertUserMeta, getUserMeta } from "./operations/users";
import type { ScrapedTweetUpsert } from "./operations/_shared";

const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-04-01",
    d1Databases: ["DB"],
});
let db: ReturnType<typeof drizzle<typeof schema>>;
before(async () => {
    const binding = await mf.getD1Database("DB");
    const folder = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(folder, { recursive: true }))
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        const migration = await readFile(new URL(name, folder), "utf8");
        for (const statement of migration.replaceAll("--> statement-breakpoint", "").split(";")) {
            if (statement.trim()) await binding.prepare(statement).run();
        }
    }
    db = drizzle(binding, { schema });
});
after(async () => {
    await mf.dispose();
});

const input = (id: string, mediaIndex = 0): ScrapedTweetUpsert => ({
    tweet: {
        id: id as schema.TweetId,
        eventId: "cf22" as schema.EventId,
        user: "artist" as schema.UserId,
        text: "catalogue",
        tweetUrl: `https://x.com/artist/status/${id}`,
        timestamp: new Date(),
        imageMask: 1 << mediaIndex,
        classification: "catalogue",
        inferredFandoms: ["Original"],
        inferredBoothId: "A12" as schema.BoothId,
    },
    media: [
        {
            tweetId: id as schema.TweetId,
            mediaIndex,
            r2Key: `${id}/${mediaIndex}.webp`,
            sourceUrl: "https://pbs.twimg.com/media/test",
        },
    ],
});

void test("D1 atomically merges retry media and preserves stronger metadata", async () => {
    await upsertScrapedTweet(db, input("900"));
    await upsertScrapedTweet(db, input("900", 2));
    await upsertScrapedTweet(db, {
        tweet: {
            ...input("900").tweet,
            classification: "error",
            imageMask: 0,
            inferredFandoms: [],
            inferredBoothId: null,
        },
        media: [],
    });
    const stored = await getTweet(db, "900" as schema.TweetId);
    assert.equal(stored?.imageMask, 5);
    assert.equal(stored?.classification, "catalogue");
    assert.deepEqual(stored?.inferredFandoms, ["Original"]);
    assert.equal(stored?.inferredBoothId, "A12");
    assert.equal((await listTweetMedia(db, "900" as schema.TweetId)).length, 2);
});

void test("D1 rolls back the tweet when a media constraint fails", async () => {
    const broken = input("901");
    broken.media[0]!.tweetId = "missing" as schema.TweetId;
    await assert.rejects(upsertScrapedTweet(db, broken));
    assert.equal(await getTweet(db, "901" as schema.TweetId), undefined);
});

void test("D1 item retries preserve other catalogues and missing metadata does not erase known values", async () => {
    await upsertScrapedTweet(db, input("902"));
    await upsertScrapedTweet(db, input("903"));
    const user = "artist" as schema.UserId;
    const eventId = "cf22" as schema.EventId;
    await replaceUserItems(db, {
        eventId,
        user,
        sourceTweetId: "902" as schema.TweetId,
        items: [{ type: "print" }],
    });
    await replaceUserItems(db, {
        eventId,
        user,
        sourceTweetId: "903" as schema.TweetId,
        items: [{ type: "sticker" }],
    });
    await replaceUserItems(db, {
        eventId,
        user,
        sourceTweetId: "902" as schema.TweetId,
        items: [{ type: "book" }],
    });
    assert.deepEqual(
        (await listUserItems(db, eventId, user)).map((item) => item.type),
        ["book", "sticker"],
    );
    await upsertUserMeta(db, {
        eventId,
        user,
        boothId: "A12" as schema.BoothId,
        preorderDeadline: "2026-05-01",
    });
    await upsertUserMeta(db, { eventId, user, boothId: null, preorderDeadline: null });
    assert.equal((await getUserMeta(db, eventId, user))?.preorderDeadline, "2026-05-01");
});

void test("D1 supports thread rerooting and booth rebuilds without interactive transactions", async () => {
    await upsertScrapedTweet(db, input("910"));
    await upsertScrapedTweet(db, {
        ...input("911"),
        tweet: {
            ...input("911").tweet,
            rootTweetId: "910" as schema.TweetId,
            parentTweetId: "910" as schema.TweetId,
            threadPosition: 1,
        },
    });
    const rows = await rerootThread(db, {
        rootTweetId: "910" as schema.TweetId,
        newRootTweetId: "911" as schema.TweetId,
    });
    assert.equal(rows.find((row) => row.id === "911")?.rootTweetId, null);
    assert.equal(rows.find((row) => row.id === "910")?.rootTweetId, "911");
    assert.ok((await rebuildBoothsFromTweets(db, "cf22" as schema.EventId)).length > 0);
});

void test("confirmed negative classification clears legacy error state, and empty bonus metadata preserves known catalogues", async () => {
    await upsertScrapedTweet(db, {
        tweet: { ...input("920").tweet, classification: "error", imageMask: 0 },
        media: [],
    });
    await upsertScrapedTweet(db, {
        tweet: { ...input("920").tweet, classification: "not_catalogue", imageMask: 0 },
        media: [],
    });
    assert.equal((await getTweet(db, "920" as schema.TweetId))?.classification, "not_catalogue");
    await upsertScrapedTweet(db, input("921"));
    await upsertScrapedTweet(db, {
        ...input("921"),
        tweet: { ...input("921").tweet, inferredFandoms: [], inferredBoothId: null },
    });
    assert.deepEqual((await getTweet(db, "921" as schema.TweetId))?.inferredFandoms, ["Original"]);
});

void test("larger catalogue item lists stay within D1 parameter limits", async () => {
    await upsertScrapedTweet(db, input("930"));
    const rows = await replaceUserItems(db, {
        eventId: "cf22" as schema.EventId,
        user: "artist" as schema.UserId,
        sourceTweetId: "930" as schema.TweetId,
        items: Array.from({ length: 20 }, (_, index) => ({ type: `item-${index}` })),
    });
    assert.equal(rows.length, 20);
});
