import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { ImportRecord } from "./types";

const IMPORTS_FILE = "imports.json";

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Load imports.json file
 */
export async function loadImportsJson(): Promise<ImportRecord[]> {
    try {
        const data = await readFile(IMPORTS_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Save imports.json file
 */
export async function saveImportsJson(imports: ImportRecord[]): Promise<void> {
    await Bun.write(IMPORTS_FILE, JSON.stringify(imports, null, 2));
}

/**
 * Generate bitmask for images 0-4 based on which image files exist
 */
export async function generateImageMask(tweetDir: string): Promise<number> {
    let mask = 0;
    for (let i = 0; i < 5; i++) {
        try {
            await readFile(join(tweetDir, `image-${i}.webp`));
            mask |= 1 << i;
        } catch {
            // Image doesn't exist, bit remains 0
        }
    }
    return mask;
}
