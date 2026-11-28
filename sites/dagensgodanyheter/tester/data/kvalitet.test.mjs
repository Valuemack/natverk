// Datatester: kvaliteten på redan publicerade artiklar. scripts/laga.mjs lagar det som går före testerna, och i
// nattbygget varnar de här testerna i stället för att stoppa natten (tester/*.test.mjs stoppar: kod och arkivskydd).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { altFel } from "../../src/lib/bildtext.js";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROT, "data", "artiklar");
const artiklar = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const register = JSON.parse(readFileSync(join(ROT, "data", "publicerade.json"), "utf8"));

test("varje artikel står i registret", () => {
  const hrefar = new Set(register.map((r) => r.href));
  for (const { f, a } of artiklar) assert.ok(hrefar.has(`/${a.kategori}/${a.slug}/`), `${f} saknas i data/publicerade.json`);
});

test("varje artikel med bild har en godkänd alt-text", () => {
  for (const { f, a } of artiklar.filter(({ a }) => a.bild?.fil)) assert.equal(altFel(a.bild.alt, a.rubrik), null, `${f}: "${a.bild.alt}"`);
});

test("varje artikel har glädjepoäng och nyhetstyp", () => {
  for (const { f, a } of artiklar) assert.ok(a.poang?.gladje != null && a.typ, `${f} saknar glädjepoäng eller typ`);
});
