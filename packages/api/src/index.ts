import app from "./app";

export default {
    async fetch(request: Request): Promise<Response> {
        return await app.fetch(request);
    },
};
