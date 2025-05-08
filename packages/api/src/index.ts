import { Hono } from "hono";
import { R2Bucket } from "@cloudflare/workers-types";

type Bindings = {
    R2: R2Bucket;
    PASSWORD: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
    return c.text("Hello Hono!");
}).post("/upload/:key", async (c) => {
    const password = c.req.header("pec-password");
    const envPassword = c.env.PASSWORD;
    if (password != envPassword) return c.json({ error: "unauthed" }, 403);
    const key = c.req.param("key");
    const data = await c.req.formData();
    const file = data.get("image");

    if (!file || typeof file === "string") {
        return c.text("No image file provided", 400);
    }

    const r2 = c.env.R2;

    await r2.put(key.replaceAll("_", "/"), file);

    c.header("Content-Type", "image/webp");
    return c.json({ ok: true });
});

export default app;
