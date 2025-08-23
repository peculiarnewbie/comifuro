/**
 * Extract tweet ID from Twitter URL
 */
export function getTweetIdFromUrl(url: string): string {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] || "" : "";
}