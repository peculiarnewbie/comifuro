import { join } from "path";

export const loadProcessedTweets = async (
    distDir: string
): Promise<Set<string>> => {
    const stateFile = join(distDir, "processed_tweets.json");
    try {
        const data = await Bun.file(stateFile).json();
        return new Set(data);
    } catch {
        return new Set();
    }
};

export const saveProcessedTweets = async (
    distDir: string,
    processedTweets: Set<string>
) => {
    const stateFile = join(distDir, "processed_tweets.json");
    await Bun.write(stateFile, JSON.stringify([...processedTweets], null, 2));
};
