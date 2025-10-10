import { tweetsOperations } from "@comifuro/core";
import { getBunSqlite } from "@comifuro/core/bunSqlite";
import { fileURLToPath } from "bun";
import { readdir } from "fs/promises";
import { resolve } from "path";

const dbUrl = new URL("../../../tweets.sqlite", import.meta.url);
console.log(dbUrl);
const bunSqlitePath = fileURLToPath(dbUrl);
const bunSqlite = getBunSqlite(bunSqlitePath);

const tweets = await tweetsOperations.selectTweets(bunSqlite, {
    limit: 100000,
});

const zeroMask = tweets.filter((t) => t.imageMask === 0);

console.log("tweets", zeroMask.length);

const distDir = resolve(import.meta.dir, "../../../dist");

console.log("distDir", distDir);

let hasImage = [];
let noImage = [];
let hasMoreImage = [];
for (const tweet of zeroMask) {
    const tweetDir = resolve(distDir, tweet.id);
    const jsonPath = resolve(tweetDir, "tweet.json");
    const imagePath = resolve(tweetDir, "image-0.webp");

    if (!(await Bun.file(jsonPath).exists())) continue;

    const dirents = await readdir(tweetDir, { withFileTypes: true });
    const files = dirents.filter((d) => d.isFile());
    if (files.some((f) => f.name === "uploaded")) {
        const uploadedFile = Bun.file(resolve(tweetDir, "uploaded"));
        await uploadedFile.delete();
        console.log("deleted uploaded file", tweet.id);
    }
    if (files.length === 2 && files.some((f) => f.name === "image-0.webp")) {
        console.log("has image", tweet.id);
        hasImage.push(tweet);
        tweetsOperations.upsertTweet(bunSqlite, {
            id: tweet.id,
            user: tweet.user,
            timestamp: tweet.timestamp,
            text: tweet.text,
            imageMask: 1,
        });
    } else if (files.length > 2) {
        console.log("has more image", tweet.id);
        hasMoreImage.push(tweet);
        const newIndexes = files
            .map((f) => f.name)
            .filter((f) => f.startsWith("image-"))
            .map((f) => parseInt(f.replace("image-", "")));

        let newMask = 0;
        for (let i = 0; i < newIndexes.length; i++) {
            newMask |= 1 << newIndexes[i]!;
        }
        tweetsOperations.upsertTweet(bunSqlite, {
            id: tweet.id,
            user: tweet.user,
            timestamp: tweet.timestamp,
            text: tweet.text,
            imageMask: newMask,
        });
    } else {
        noImage.push(tweet);
    }
}

console.log("hasImage", hasImage.length);
console.log("noImage", noImage.length);
console.log("hasMoreImage", hasMoreImage.length);

export {};
