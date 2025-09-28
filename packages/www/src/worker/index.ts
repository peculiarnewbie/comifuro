import { WorkerEntrypoint } from "cloudflare:workers";
import { createHonoApp } from "./hono";

const app = createHonoApp();
export default class extends WorkerEntrypoint {
    async fetch(request: Request) {
        // if (new URL(request.url).pathname === "/ws") {
        //     const id = env.WS.idFromName("chknpig");
        //     const stub = env.WS.get(id);
        //     return stub.fetch(request);
        // }
        return app.fetch(request);
    }
}
