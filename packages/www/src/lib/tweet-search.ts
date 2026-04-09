type SearchableTweet = {
    user: string;
    text: string;
    inferredFandoms?: string[] | null;
    inferredBoothId?: string | null;
};

export function createTweetSearchText(tweet: SearchableTweet) {
    return [
        tweet.user,
        tweet.text,
        ...(tweet.inferredFandoms ?? []),
        tweet.inferredBoothId ?? "",
    ]
        .map((value) => value.trim())
        .filter(Boolean)
        .join("\n");
}
