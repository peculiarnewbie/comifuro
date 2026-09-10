import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createOpencodeClient } from "@opencode-ai/sdk";
import type { ScraperConfig } from "./types";

type ManagedOpencode = {
    startedByScraper: boolean;
    stop: () => void;
};

function encodeBasicAuth(username: string, password: string) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function getHeaders(config: ScraperConfig) {
    if (config.opencodeUsername && config.opencodePassword) {
        return {
            Authorization: encodeBasicAuth(config.opencodeUsername, config.opencodePassword),
        };
    }

    return undefined;
}

async function isHealthy(config: ScraperConfig, signal: AbortSignal) {
    const client = createOpencodeClient({
        baseUrl: config.opencodeBaseUrl,
        headers: getHeaders(config),
        fetch: (request) =>
            fetch(request, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }),
    });

    try {
        const result = await client.app.get();
        return !result.error && Boolean(result.data);
    } catch {
        return false;
    }
}

function getManagedPort(baseUrl: string) {
    const url = new URL(baseUrl);
    return Number(url.port || (url.protocol === "https:" ? 443 : 80));
}

export async function ensureOpencodeServer(
    config: ScraperConfig,
    signal = new AbortController().signal,
): Promise<ManagedOpencode> {
    if (await isHealthy(config, signal)) {
        return {
            startedByScraper: false,
            stop: () => {},
        };
    }

    if (!config.opencodeManaged) {
        throw new Error(
            `Opencode server is not reachable at ${config.opencodeBaseUrl} and OPENCODE_MANAGED=false.`,
        );
    }

    signal.throwIfAborted();
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(config.opencodeBaseUrl).hostname)) {
        throw new Error(
            "Managed opencode requires a loopback OPENCODE_BASE_URL; start remote servers separately",
        );
    }
    const port = getManagedPort(config.opencodeBaseUrl);
    const env = {
        ...process.env,
        OPENCODE_SERVER_USERNAME: config.opencodeUsername,
        OPENCODE_SERVER_PASSWORD: config.opencodePassword,
    };

    const subprocess = spawn(
        config.opencodeBin,
        ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
        {
            env,
            stdio: ["ignore", "pipe", "pipe"],
        },
    );

    // Unconsumed pipes eventually fill and freeze a long-running classifier server.
    subprocess.stdout?.resume();
    subprocess.stderr?.resume();
    let spawnError: Error | null = null;
    subprocess.on("error", (error) => {
        spawnError = error;
    });
    const stop = () => {
        if (subprocess.exitCode !== null || subprocess.signalCode !== null) return;
        subprocess.kill();
        const forceStop = setTimeout(() => {
            subprocess.kill("SIGKILL");
        }, 5_000);
        forceStop.unref();
        subprocess.once("exit", () => clearTimeout(forceStop));
    };
    signal.addEventListener("abort", stop, { once: true });
    const startedAt = Date.now();
    try {
        while (Date.now() - startedAt < 20_000) {
            signal.throwIfAborted();
            if (spawnError) throw spawnError;
            if (subprocess.exitCode !== null)
                throw new Error(`Managed opencode server exited with code ${subprocess.exitCode}`);
            if (await isHealthy(config, signal)) {
                return {
                    startedByScraper: true,
                    stop: () => {
                        signal.removeEventListener("abort", stop);
                        stop();
                    },
                };
            }
            await sleep(300, undefined, { signal });
        }
        throw new Error(
            `Timed out waiting for managed opencode server at ${config.opencodeBaseUrl}`,
        );
    } catch (error) {
        signal.removeEventListener("abort", stop);
        stop();
        throw error;
    }
}
