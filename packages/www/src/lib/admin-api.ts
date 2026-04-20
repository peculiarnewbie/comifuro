const PASSWORD_HEADER = "pec-password";
const ACCOUNT_ID_HEADER = "x-account-id";

type AdminRequestInput = {
    apiHost: string;
    password: string;
    accountId: string;
};

function buildHeaders(input: AdminRequestInput) {
    return {
        "Content-Type": "application/json",
        [PASSWORD_HEADER]: input.password,
        [ACCOUNT_ID_HEADER]: input.accountId,
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
            headers: buildHeaders(input),
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
            headers: buildHeaders(input),
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
            headers: buildHeaders(input),
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
            headers: buildHeaders(input),
        },
    );

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    return response.json();
}
