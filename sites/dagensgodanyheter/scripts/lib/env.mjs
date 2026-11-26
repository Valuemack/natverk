// Läser natverk/.env lokalt (i GitHub Actions kommer nycklarna som secrets i miljön).
// Skriver aldrig ut några värden – bara om en nyckel finns eller inte.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function laddaEnv() {
  const fil = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".env");
  if (!existsSync(fil)) return;
  for (const rad of readFileSync(fil, "utf8").split(/\r?\n/)) {
    const m = rad.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
