import { Glob } from "bun";

const endpoint = "https://api-comifuro.peculiarnewbie.workers.dev/upload";

const glob = new Glob("**/*.webp");

let i = 0;

for await (const path of glob.scan("../dist")) {
    const fullPath = "../dist/" + path;

    const file = Bun.file(fullPath);

    const formData = new FormData();
    formData.append("image", file);

    const key = fullPath
        .replace("../dist", "")
        .replace("/twitter-article-", "_")
        .replace("/image-", "_")
        .replace(".webp", "");

    console.log(i, file.name, key);
    console.time("upload");
    await fetch(endpoint + key, {
        method: "POST",
        headers: {
            "pec-password": process.env.PASSWORD ?? "",
        },
        body: formData,
    });
    console.timeEnd("upload");

    i++;
}

export {};
