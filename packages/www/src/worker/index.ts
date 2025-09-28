import { env, WorkerEntrypoint } from "cloudflare:workers";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import Elysia from "elysia";
import { createRoutes } from "./app";

const elysia = new Elysia({
    adapter: CloudflareAdapter,
});

const app = createRoutes(elysia, env.DB, env.BUCKET as any);

export default class extends WorkerEntrypoint {
    async fetch(request: Request) {
        if (new URL(request.url).pathname === "/hey") {
            return new Response("Hello Cloudflare Worker!");
        }
        return new Response("Not found", { status: 404 });
        // if (new URL(request.url).pathname === "/ws") {
        //     const id = env.WS.idFromName("chknpig");
        //     const stub = env.WS.get(id);
        //     return stub.fetch(request);
        // }
        // return app.fetch(request);
    }
}
