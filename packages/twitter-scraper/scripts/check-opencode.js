const baseUrl = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4097";
const configuredProviderId = process.env.OPENCODE_PROVIDER_ID;
const configuredModelId = process.env.OPENCODE_MODEL_ID;
const username = process.env.OPENCODE_SERVER_USERNAME;
const password = process.env.OPENCODE_SERVER_PASSWORD;

function getHeaders() {
    const headers = {
        "Content-Type": "application/json",
    };

    if (username && password) {
        headers.Authorization = `Basic ${Buffer.from(
            `${username}:${password}`,
        ).toString("base64")}`;
    }

    return headers;
}

async function request(path, init = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            ...getHeaders(),
            ...(init.headers ?? {}),
        },
    });

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!response.ok) {
        throw new Error(
            `Request failed: ${response.status} ${response.statusText}\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
        );
    }

    return data;
}

function extractText(parts) {
    return (parts ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
}

async function resolveProviderAndModel() {
    const providersResult = await request("/config/providers", {
        method: "GET",
    });

    const defaults = providersResult.default ?? {};
    const providerId = configuredProviderId ?? Object.keys(defaults)[0];

    if (!providerId) {
        throw new Error("No provider resolved from env or opencode defaults");
    }

    const modelId = configuredModelId ?? defaults[providerId];

    if (!modelId) {
        throw new Error(`No model resolved for provider ${providerId}`);
    }

    return { providerId, modelId, defaults };
}

async function main() {
    const { providerId, modelId } = await resolveProviderAndModel();
    const prompt = process.argv.slice(2).join(" ") || "what model are you";

    const session = await request("/session", {
        method: "POST",
        body: JSON.stringify({
            title: "twitter-scraper-model-check",
        }),
    });

    try {
        const message = await request(`/session/${session.id}/message`, {
            method: "POST",
            body: JSON.stringify({
                model: {
                    providerID: providerId,
                    modelID: modelId,
                },
                parts: [
                    {
                        type: "text",
                        text: prompt,
                    },
                ],
            }),
        });

        process.stdout.write(`${extractText(message.parts)}\n`);
    } finally {
        await request(`/session/${session.id}`, {
            method: "DELETE",
        });
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
