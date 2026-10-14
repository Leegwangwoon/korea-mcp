import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// data/ sits next to src/ and dist/, so this resolves both under tsx and after build.
export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export function loadText(file) {
    return readFileSync(join(DATA_DIR, file), "utf8");
}
export function loadData(file) {
    return JSON.parse(loadText(file));
}
