const endpoint = "http://localhost:8787/upload";

const file = Bun.file("./dist/2025-05-04/twitter-article-1/image-0.webp");

console.log(file);

const formData = new FormData();
formData.append("image", file);

console.time("upload");
await fetch(endpoint, {
    method: "POST",
    body: formData,
});
console.timeEnd("upload");

export {};
