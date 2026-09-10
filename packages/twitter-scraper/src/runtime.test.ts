import assert from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import { HttpError, parseRetryAfter, Runtime } from "./runtime";

class ImmediateRuntime extends Runtime {
    delays: number[] = [];
    override async wait(ms: number) {
        this.signal.throwIfAborted();
        this.delays.push(ms);
    }
}

describe("HTTP resilience", () => {
    test("parses numeric and HTTP-date Retry-After values", () => {
        expect(parseRetryAfter("120")).toBe(120000);
        expect(parseRetryAfter("Thu, 01 Jan 1970 00:02:00 GMT", 1000)).toBe(119000);
        expect(parseRetryAfter("invalid")).toBe(0);
    });
    test("retries serially, respects cooldowns, and can replay a Request body", async () => {
        const bodies: string[] = [];
        const server = Bun.serve({
            port: 0,
            async fetch(request) {
                bodies.push(await request.text());
                return bodies.length === 1
                    ? new Response(null, { status: 429, headers: { "retry-after": "1800" } })
                    : Response.json({ ok: true });
            },
        });
        const cooldowns: number[] = [];
        const runtime = new ImmediateRuntime(new AbortController().signal, (until) =>
            cooldowns.push(until),
        );
        try {
            const request = new Request(server.url, { method: "POST", body: "payload" });
            expect(await runtime.request(request, {}, (res) => res.json())).toEqual({ ok: true });
            expect(bodies).toEqual(["payload", "payload"]);
            expect(runtime.delays[0]).toBeGreaterThanOrEqual(1800000);
            expect(cooldowns).toHaveLength(1);
        } finally {
            await server.stop(true);
        }
    });
    test("does not retry authentication failures", async () => {
        let calls = 0;
        const server = Bun.serve({
            port: 0,
            fetch() {
                calls++;
                return new Response(null, { status: 401 });
            },
        });
        try {
            const runtime = new ImmediateRuntime(new AbortController().signal);
            await assert.rejects(
                runtime.request(server.url, {}, (res) => res.text()),
                HttpError,
            );
            expect(calls).toBe(1);
        } finally {
            await server.stop(true);
        }
    });
    test("bounds retries and persists the final rate-limit deadline", async () => {
        let calls = 0;
        const cooldowns: number[] = [];
        const server = Bun.serve({
            port: 0,
            fetch() {
                calls++;
                return new Response(null, { status: 429 });
            },
        });
        try {
            const runtime = new ImmediateRuntime(new AbortController().signal, (until) =>
                cooldowns.push(until),
            );
            await assert.rejects(
                runtime.request(server.url, {}, (res) => res.text()),
                /429/,
            );
            expect(calls).toBe(3);
            expect(cooldowns).toHaveLength(3);
            expect(cooldowns[2]).toBeGreaterThan(Date.now() + 890000);
        } finally {
            await server.stop(true);
        }
    });
    test("timeouts include a response body that never finishes", async () => {
        const server = Bun.serve({
            port: 0,
            fetch() {
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("partial"));
                        },
                    }),
                );
            },
        });
        try {
            const runtime = new ImmediateRuntime(new AbortController().signal);
            await assert.rejects(runtime.request(server.url, {}, (res) => res.text(), 20));
        } finally {
            await server.stop(true);
        }
    });
});
