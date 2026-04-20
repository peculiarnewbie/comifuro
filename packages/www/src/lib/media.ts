export const MEDIA_HOST = "https://r2.comifuro.peculiarnewbie.com";

export function createImageUrl(image: string) {
    return `${MEDIA_HOST}/${image}`;
}
