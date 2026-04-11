const PASSWORD_HEADER = "pec-password";

type AdminRequestInput = {
    apiHost: string;
    password: string;
};

function buildHeaders(password: string) {
    return {
        "Content-Type": "application/json",
        [PASSWORD_HEADER]: password,
    };
}

async function readErrorMessage(response: Response) {
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === "object") {
        const error = "error" in payload ? payload.error : null;
        const message = "message" in payload ? payload.message : null;
        if (typeof error === "string" && error) {
            return error;
        }

        if (typeof message === "string" && message) {
            return message;
        }
    }

    return `request failed with status ${response.status}`;
}

export function parseTagInput(value: string) {
    return Array.from(
        new Set(
            value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean),
        ),
    );
}

export async function updateTweetMetadata(
    input: AdminRequestInput & {
        tweetId: string;
        inferredFandoms?: string[];
        matchedTags?: string[];
    },
) {
    const response = await fetch(
        `${input.apiHost}/admin/tweets/${input.tweetId}/metadata`,
        {
            method: "PATCH",
            headers: buildHeaders(input.password),
            body: JSON.stringify({
                inferredFandoms: input.inferredFandoms,
                matchedTags: input.matchedTags,
            }),
        },
    );

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return response.json();
}

export async function rerootThread(
    input: AdminRequestInput & {
        rootTweetId: string;
        newRootTweetId: string;
    },
) {
    const response = await fetch(
        `${input.apiHost}/admin/threads/${input.rootTweetId}/reroot`,
        {
            method: "POST",
            headers: buildHeaders(input.password),
            body: JSON.stringify({
                newRootTweetId: input.newRootTweetId,
            }),
        },
    );

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return response.json();
}

export async function uncatalogueTweet(
    input: AdminRequestInput & {
        tweetId: string;
    },
) {
    const response = await fetch(
        `${input.apiHost}/admin/tweets/${input.tweetId}/uncatalogue`,
        {
            method: "POST",
            headers: buildHeaders(input.password),
        },
    );

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return response.json();
}

export async function removeFollowUpTweet(
    input: AdminRequestInput & {
        tweetId: string;
    },
) {
    const response = await fetch(
        `${input.apiHost}/admin/tweets/${input.tweetId}/remove-follow-up`,
        {
            method: "POST",
            headers: buildHeaders(input.password),
        },
    );

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return response.json();
}
