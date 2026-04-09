import { workerApp, type WorkerBindings } from "./api";

export default {
    fetch(request, env, ctx) {
        const pathname = new URL(request.url).pathname;

        if (pathname === "/api" || pathname.startsWith("/api/")) {
            return workerApp.fetch(request, env, ctx);
        }

        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<WorkerBindings>;
