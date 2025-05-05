import { distDir } from "./main";
import { readdir } from "node:fs/promises"

const folders = await readdir(distDir)

console.log(folders)

export { }

