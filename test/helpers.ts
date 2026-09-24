import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name: string): unknown {
  const raw = readFileSync(join(here, "fixtures", name), "utf-8");
  return JSON.parse(raw);
}
