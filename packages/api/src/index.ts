import { Hono } from "hono";
import { R2Bucket } from "@cloudflare/workers-types";

type Bindings = {
    R2: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
    return c.text("Hello Hono!");
}).post("/upload", async (c) => {
    const data = await c.req.formData();
    const file = data.get("image");

    if (!file || typeof file === "string") {
        return c.text("No image file provided", 400);
    }

    const r2 = c.env.R2;

    await r2.put("2025-05-04/1/0", file);

    c.header("Content-Type", "image/webp");
    return c.json({ ok: true });
});
// .get("/day/:day", async (c) => {
//     const day = c.req.param("day");

//     const glob = new Glob("**/*.json");

//     const files = glob.scan(`./dist/${day}/`);

//     for await (const file of files) {
//         console.log(file);
//     }

//     const file = Bun.file(`./dist/${day}/twitter-article-0/image-0.webp`);
//     const stream = await file.arrayBuffer();

//     c.header("Content-Type", "image/webp");
//     return c.body(stream);
// });

export default app;
