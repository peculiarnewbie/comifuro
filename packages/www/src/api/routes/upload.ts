import { z } from "zod";
import { Result } from "better-result";
import { getDb, requirePassword } from "../auth";
import { ValidationError } from "../errors";
import { handleResult } from "../responder";
import { TWEET_MEDIA_KEY_REGEX } from "../helpers";
import type { AppContext } from "../types";

const imageUploadSchema = z.object({
    key: z.string().min(1),
});

export async function uploadImage(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    let decodedKey: string;
    try {
        const keyParam = c.req.param("key");
        if (!keyParam) {
            return c.json({ error: "missing key" }, 400);
        }
        decodedKey = decodeURIComponent(keyParam);
    } catch {
        return c.json({ error: "invalid key encoding" }, 400);
    }

    const parsedKey = imageUploadSchema.safeParse({ key: decodedKey });
    if (!parsedKey.success) {
        return c.json({ error: parsedKey.error.issues[0]?.message }, 400);
    }

    if (!TWEET_MEDIA_KEY_REGEX.test(parsedKey.data.key)) {
        return c.json({ error: "invalid key format" }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get("image");
    if (!file || typeof file === "string") {
        return c.json({ error: "no image file provided" }, 400);
    }

    await c.env.R2.put(parsedKey.data.key, file as File, {
        httpMetadata: {
            contentType: (file as File).type || "image/webp",
        },
    });

    return c.json({ ok: true, key: parsedKey.data.key });
}
