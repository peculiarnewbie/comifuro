import { workerApp } from "./api";
import type { WorkerBindings } from "./api/types";
import { RateLimiter } from "./rate-limiter";

export { RateLimiter };

type Env = WorkerBindings & {
    ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // API routes are handled by the Hono app
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
            return workerApp.fetch(request, env, ctx);
        }

        // Static assets are served by the ASSETS binding
        const response = await env.ASSETS.fetch(request);
        if (response.status !== 404 || request.method !== "GET") return response;

        // SPA fallback: serve index.html for non-file paths
        if (url.pathname.includes(".")) return response;

        return env.ASSETS.fetch(new Request(new URL("/", url), request));
    },
} satisfies ExportedHandler<Env>;
