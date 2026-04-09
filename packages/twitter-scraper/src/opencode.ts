import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createOpencodeClient } from "@opencode-ai/sdk";
import type { Part } from "@opencode-ai/sdk";
import type { ClassificationResult, ScraperConfig } from "./types";

function encodeBasicAuth(username: string, password: string) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function extractText(parts: Part[]) {
    return parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
}

function extractJsonObject(raw: string) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] ?? raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error(`opencode did not return JSON: ${raw}`);
    }

    return JSON.parse(candidate.slice(start, end + 1)) as {
        isCatalogue: boolean;
        confidence: "low" | "medium" | "high";
        reason: string;
    };
}

function renderPrompt(
    template: string,
    input: {
        tweetText: string;
        matchedTags: string[];
        searchQuery: string;
    },
) {
    const replaced = template
        .replaceAll("{{tweet_text}}", input.tweetText)
        .replaceAll("{{matched_tags}}", input.matchedTags.join(", "))
        .replaceAll("{{search_query}}", input.searchQuery);

    if (replaced !== template) {
        return replaced;
    }

    return `${template.trim()}

Tweet text:
${input.tweetText || "[empty]"}

Matched hashtags:
${input.matchedTags.join(", ") || "[none]"}

Search query:
${input.searchQuery}

Respond with JSON only:
{"isCatalogue":true|false,"confidence":"low|medium|high","reason":"short explanation"}`;
}

export async function createClassifier(config: ScraperConfig) {
    const headers =
        config.opencodePassword && config.opencodeUsername
            ? {
                  Authorization: encodeBasicAuth(
                      config.opencodeUsername,
                      config.opencodePassword,
                  ),
              }
            : undefined;

    const client = createOpencodeClient({
        baseUrl: config.opencodeBaseUrl,
        headers,
    });

    const promptTemplate = await readFile(config.classifierPromptPath, "utf8");
    const promptVersion = createHash("sha1")
        .update(promptTemplate)
        .digest("hex")
        .slice(0, 12);

    const providersResult = await client.config.providers();
    if (providersResult.error || !providersResult.data) {
        throw new Error("failed to load opencode providers");
    }

    const providerId =
        config.opencodeProviderId ??
        Object.keys(providersResult.data.default)[0];

    if (!providerId) {
        throw new Error("No opencode provider configured");
    }

    const modelId =
        config.opencodeModelId ?? providersResult.data.default[providerId];

    if (!modelId) {
        throw new Error(`No default model configured for provider ${providerId}`);
    }

    return {
        promptVersion,
        async classify(input: {
            tweetText: string;
            matchedTags: string[];
            searchQuery: string;
        }): Promise<ClassificationResult> {
            const sessionResult = await client.session.create({
                body: {
                    title: `${config.eventId}-classifier-${Date.now()}`,
                },
            });

            if (sessionResult.error || !sessionResult.data) {
                throw new Error("failed to create opencode session");
            }

            const sessionId = sessionResult.data.id;

            try {
                const chatResult = await client.session.chat({
                    path: { id: sessionId },
                    body: {
                        providerID: providerId,
                        modelID: modelId,
                        system:
                            "You are a strict binary classifier. Return JSON only, no prose, no markdown.",
                        parts: [
                            {
                                type: "text",
                                text: renderPrompt(promptTemplate, input),
                            },
                        ],
                    },
                });

                if (chatResult.error || !chatResult.data) {
                    throw new Error("opencode classification request failed");
                }

                const raw = extractText(chatResult.data.parts);
                const parsed = extractJsonObject(raw);

                return {
                    isCatalogue: parsed.isCatalogue,
                    confidence: parsed.confidence,
                    reason: parsed.reason,
                    raw,
                };
            } finally {
                await client.session.delete({
                    path: { id: sessionId },
                });
            }
        },
    };
}
