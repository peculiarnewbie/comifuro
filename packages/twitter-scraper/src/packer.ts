import { Glob } from "bun";
import { readdir } from "node:fs/promises";

const glob = new Glob("**/*.json");
const globImg = new Glob("**/*.webp");
type StoredTweet = {
    images: string[];
    text: string;
    user: string;
    time: string;
    url: string;
};

const tweetsArray: [string, StoredTweet][] = [];

for await (const path of glob.scan("../dist")) {
    const fullPath = "../dist/" + path;
    const files = await readdir(fullPath.replace("tweet.json", ""));
    const images = files
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(".webp", "").replace("image-", ""));
    const json = await Bun.file(fullPath).json();
    json.images = images.sort();
    const shortened = path
        .replace("/twitter-article-", "/")
        .replace("tweet.json", "");
    tweetsArray.push([shortened, json]);
}

tweetsArray.sort((a, b) => b[1].time.localeCompare(a[1].time));

const tweets: Record<string, StoredTweet> = Object.fromEntries(tweetsArray);

await Bun.write("./dist/tweets.json", JSON.stringify(tweets));

export {};
