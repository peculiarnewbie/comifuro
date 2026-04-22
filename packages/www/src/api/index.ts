import { Hono } from "hono";
import { cors } from "hono/cors";
import { isRateLimited } from "../rate-limiter";
import { resolveAccount } from "./auth";
import type { Env } from "./types";
import {
    uploadImage,
} from "./routes/upload";
import {
    getLastTweet,
    syncTweets,
    upsertLegacyTweets,
} from "./routes/tweets";
import {
    upsertScraperTweet,
    getScraperState,
    putScraperState,
    exportPublicFeed,
} from "./routes/scraper";
import {
    listMissingThumbnails,
    setThumbnail,
    updateTweetMetadata,
    rerootThread,
    uncatalogueTweet,
    removeFollowUp,
} from "./routes/admin";
import { getMarks, syncMarks } from "./routes/marks";
import { listBooths, getBooth, rebuildBooths } from "./routes/booths";

function getAllowedOrigins(): string[] {
    const base = ["https://cf.peculiarnewbie.com"];
    if (import.meta.env.DEV) {
        base.push("http://localhost:5173", "http://localhost:3000");
    }
    return base;
}

const api = new Hono<Env>();

api.use(
    "*",
    cors({
        origin: (origin) => {
            const allowed = getAllowedOrigins();
            if (!origin) {
                return "";
            }
            return allowed.includes(origin) ? origin : "";
        },
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: [
            "Content-Type",
            "Authorization",
            "X-Replicache-RequestID",
            "pec-password",
            "x-account-id",
        ],
        exposeHeaders: ["Content-Length"],
        maxAge: 86400,
        credentials: true,
    }),
);

api.use("*", async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const pathname = c.req.path;

    let maxRequests = 60;
    let windowMs = 60000;

    if (
        pathname.startsWith("/api/upload/") ||
        pathname.startsWith("/api/scraper/")
    ) {
        maxRequests = 30;
        windowMs = 60000;
    }

    if (await isRateLimited(c.env, ip, pathname, maxRequests, windowMs)) {
        return c.json({ error: "rate limited" }, 429);
    }

    await next();
});

api.use("*", resolveAccount);

api.get("/", (c) => c.text("ok"));
api.post("/upload/:key", uploadImage);
api.get("/tweets/last", getLastTweet);
api.get("/tweets/sync", syncTweets);
api.post("/tweets/upsert", upsertLegacyTweets);
api.get("/admin/media/missing-thumbnails", listMissingThumbnails);
api.patch(
    "/admin/media/:tweetId/:mediaIndex/thumbnail",
    setThumbnail,
);
api.patch("/admin/tweets/:id/metadata", updateTweetMetadata);
api.post("/admin/threads/:id/reroot", rerootThread);
api.post("/admin/tweets/:id/uncatalogue", uncatalogueTweet);
api.post("/admin/tweets/:id/remove-follow-up", removeFollowUp);
api.post("/scraper/tweets/upsert", upsertScraperTweet);
api.get("/scraper/state/:id", getScraperState);
api.put("/scraper/state/:id", putScraperState);
api.post("/scraper/export-public-feed", exportPublicFeed);
api.get("/marks", getMarks);
api.post("/marks/sync", syncMarks);
api.get("/booths", listBooths);
api.get("/booths/:id", getBooth);
api.post("/admin/booths/rebuild", rebuildBooths);

export const workerApp = new Hono<Env>().route("/api", api);
