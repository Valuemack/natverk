// Publicerar den dagliga prishistoriken så att nästa bygge kan bygga vidare på den (se scripts/historik.mjs).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function GET() {
  const fil = resolve(process.cwd(), "data/dagspriser.json");
  const body = existsSync(fil) ? readFileSync(fil, "utf8") : JSON.stringify({ dagar: [] });
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
