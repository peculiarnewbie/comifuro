import { Glob } from "bun";
import sharp from "sharp";

const processImage = async (input: ArrayBuffer, target: string) => {
    try {
        await sharp(input)
            .resize({ width: 1080, height: 1080, fit: "inside" })
            .webp({ quality: 80 })
            .toFile(target);
        return true;
    } catch (e) {
        console.error(e);
    }
    return false;
};

const glob = new Glob("**/*.jpg");

const distFolder = Bun.fileURLToPath(import.meta.resolve("../../dist"));

let i = 0;

for await (const path of glob.scan("../dist")) {
    const fullPath = distFolder + "/" + path;
    const arrayBuffer = await Bun.file(fullPath).arrayBuffer();
    console.log("processing", fullPath);
    await processImage(arrayBuffer, fullPath.replace(".jpg", ".webp"));
    await Bun.file(fullPath).delete();
    i++;
}

console.log("converted", i, "images");
