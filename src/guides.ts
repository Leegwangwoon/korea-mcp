import { readdirSync } from "node:fs";
import { loadText, DATA_DIR } from "./data.js";
import { join } from "node:path";

export const GUIDE_TOPICS = readdirSync(join(DATA_DIR, "guides"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""))
  .sort();

export function loadGuide(topic: string): string {
  return loadText(`guides/${topic}.md`);
}
