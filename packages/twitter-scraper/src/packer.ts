import { Glob } from "bun";
import { readdir } from "node:fs/promises";

const glob = new Glob("**/*.json");
const globImg = new Glob("**/*.webp");

const tweets: Record<string, string> = {};

for await (const path of glob.scan("../dist")) {
    const fullPath = "../dist/" + path;
    const files = await readdir(fullPath.replace("tweet.json", ""));
    const images = files
        .filter((f) => f.endsWith(".webp"))
        .map((f) => f.replace(".webp", "").replace("image-", ""));
    const json = await Bun.file(fullPath).json();
    json.images = images;
    const shortened = path
        .replace("/twitter-article-", "/")
        .replace("tweet.json", "");
    tweets[shortened] = JSON.stringify(json);
}

await Bun.write("./dist/tweets.json", JSON.stringify(tweets));

export {};
