import { Elysia } from "elysia";
declare const app: Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
}, {
    get: {
        body: unknown;
        params: {};
        query: unknown;
        headers: unknown;
        response: {
            200: string;
        };
    };
} & {
    upload: {
        ":key": {
            post: {
                body: {
                    image: File;
                };
                params: {
                    key: string;
                };
                query: unknown;
                headers: {
                    "pec-password": string;
                };
                response: {
                    200: undefined;
                    403: {
                        readonly error: "unauthed";
                    };
                    400: {
                        readonly error: "Invalid key encoding";
                    } | {
                        readonly error: "No image file provided";
                    };
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
} & {
    tweets: {
        last: {
            get: {
                body: unknown;
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        id: string;
                        user: string;
                        timestamp: Date;
                        text: string;
                        imageMask: number;
                    };
                };
            };
        };
    };
} & {
    tweets: {
        last: {
            get: {
                body: unknown;
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        id: string;
                        user: string;
                        timestamp: Date;
                        text: string;
                        imageMask: number;
                    };
                };
            };
        };
    };
} & {
    tweets: {
        get: {
            body: unknown;
            params: {};
            query: {
                limit?: number | undefined;
                offset?: number | undefined;
            };
            headers: unknown;
            response: {
                200: {
                    id: string;
                    user: string;
                    timestamp: Date;
                    text: string;
                    imageMask: number;
                }[];
                422: {
                    type: "validation";
                    on: string;
                    summary?: string;
                    message?: string;
                    found?: unknown;
                    property?: string;
                    expected?: string;
                };
            };
        };
    };
} & {
    tweets: {
        upsert: {
            post: {
                body: {
                    text: string;
                    id: string;
                    timestamp: string | number;
                    user: string;
                    imageMask: number;
                }[];
                params: {
                    key: string;
                };
                query: unknown;
                headers: {
                    "pec-password": string;
                };
                response: {
                    200: {
                        ok: boolean;
                        count: number;
                    };
                    403: {
                        readonly error: "unauthed";
                    };
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
} & {
    "purge-metadata": {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                [x: string]: any;
                200: any;
            };
        };
    };
} & {
    "purge-everything": {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                [x: string]: any;
                200: any;
            };
        };
    };
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}>;
export default app;
