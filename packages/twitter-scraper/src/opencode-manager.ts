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
            Authorization: encodeBasicAuth(
                config.opencodeUsername,
                config.opencodePassword,
            ),
        };
    }

    return undefined;
}

async function isHealthy(config: ScraperConfig) {
    const client = createOpencodeClient({
        baseUrl: config.opencodeBaseUrl,
        headers: getHeaders(config),
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
): Promise<ManagedOpencode> {
    if (await isHealthy(config)) {
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

    const startedAt = Date.now();
    const timeoutMs = 20_000;

    while (Date.now() - startedAt < timeoutMs) {
        if (subprocess.exitCode !== null) {
            throw new Error(
                `Managed opencode server exited early with code ${subprocess.exitCode}.`,
            );
        }

        if (await isHealthy(config)) {
            return {
                startedByScraper: true,
                stop: () => {
                    try {
                        subprocess.kill();
                    } catch {
                        // Ignore shutdown races.
                    }
                },
            };
        }

        await sleep(300);
    }

    try {
        subprocess.kill();
    } catch {
        // Ignore shutdown races.
    }

    throw new Error(
        `Timed out waiting for managed opencode server at ${config.opencodeBaseUrl}`,
    );
}
