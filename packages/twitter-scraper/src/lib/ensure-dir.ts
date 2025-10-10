import { access, mkdir } from "node:fs/promises";

export const ensureDir = async (dir: string) => {
    try {
        await access(dir);
    } catch {
        try {
            await mkdir(dir, { recursive: true });
            console.log(`Directory created`, dir);
        } catch {
            return "";
        }
    }
};
