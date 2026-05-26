import * as Schema from "effect/Schema";
import { requirePassword } from "../auth";
import { Result, handleResult } from "../responder";
import { helpers } from "@comifuro/core";
import type { AppContext } from "../types";

const ImageUpload = Schema.Struct({
    key: Schema.String,
});

export async function uploadImage(c: AppContext) {
    const authResult = await requirePassword(c);
    if (Result.isError(authResult)) {
        return handleResult(c, authResult, () => {
            throw new Error("unreachable");
        });
    }

    const keyParam = c.req.param("key");
    if (!keyParam) {
        return c.json({ error: "missing key" }, 400);
    }

    const decodedKey = decodeURIComponent(keyParam);
    const parsed = Schema.decodeUnknownSync(ImageUpload)({ key: decodedKey });

    if (!helpers.TWEET_MEDIA_KEY_REGEX.test(parsed.key)) {
        return c.json({ error: "invalid key format" }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get("image");
    if (!file || typeof file === "string") {
        return c.json({ error: "no image file provided" }, 400);
    }

    await c.env.R2.put(parsed.key, file as File, {
        httpMetadata: {
            contentType: (file as File).type || "image/webp",
        },
    });

    return c.json({ ok: true, key: parsed.key });
}
