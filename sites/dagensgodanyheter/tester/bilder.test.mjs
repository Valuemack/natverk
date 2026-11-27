// Bilder: alltid gpt-image-2.6-flare (ingen reservmodell), alltid en godkänd alt-text och en bildtext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { altFel, BILDTEXT_GENERERAD, ALT_MIN, ALT_MAX } from "../src/lib/bildtext.js";
import { bildInstallningar, byggPrompt, STANDARDMODELL } from "../scripts/lib/ai-bild.mjs";
import { kortaAlt } from "../scripts/lib/bilder.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const artiklar = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

test("varje artikel med bild har en godkänd alt-text", () => {
  for (const { f, a } of artiklar.filter(({ a }) => a.bild?.fil)) {
    assert.equal(altFel(a.bild.alt, a.rubrik), null, `${f}: "${a.bild.alt}"`);
  }
});

test("alt-textreglerna underkänner tomma, korta, långa och felaktiga texter", () => {
  const bra = "Målad illustration av en utter som simmar i en klar älv mellan mossiga stenar i morgonljus.";
  assert.equal(altFel(bra, "Uttern är tillbaka i Dalälven"), null);
  assert.ok(altFel("", "x"));
  assert.ok(altFel(undefined, "x"));
  assert.ok(altFel("En utter i en älv.", "x"), "för kort");
  assert.ok(altFel(`${"Målad illustration av en utter i en älv, ".repeat(4)}.`, "x"), "för lång");
  assert.ok(altFel("AI-bild av en utter som simmar i en klar älv mellan mossiga stenar i det tidiga morgonljuset.", "x"), "ordet AI");
  assert.ok(altFel("Målad illustration av en utter som simmar i en klar älv mellan mossiga stenar i morgonljus och", "x"), "ingen punkt");
  const rubrik = "Uttern har kommit tillbaka till Dalälven efter femtio år utan observationer i området";
  assert.ok(altFel(`${rubrik}.`, rubrik), "rubriken upprepad");
  assert.ok(ALT_MIN >= 80 && ALT_MAX <= 125);
});

test("för långa alt-texter kortas bara vid en satsgräns", () => {
  const lang = "Målad illustration av solpaneler i förgrunden och vindkraftverk i bakgrunden under blå himmel, med gula blommor i gräset och fjärilar.";
  const k = kortaAlt(lang);
  assert.ok(k.length <= ALT_MAX && k.endsWith("."), k);
  assert.equal(altFel(k, ""), null, k);
});

test("bildmodellen är alltid gpt-image-2.6-flare, även om någon försöker byta", () => {
  const forra = process.env.GODA_BILDMODELL;
  process.env.GODA_BILDMODELL = "en-annan-modell";
  try { assert.equal(bildInstallningar().modell, "gpt-image-2.6-flare"); } finally { if (forra === undefined) delete process.env.GODA_BILDMODELL; else process.env.GODA_BILDMODELL = forra; }
  assert.equal(STANDARDMODELL, "gpt-image-2.6-flare");
  // Ingen annan bildmodell eller reservväg i skripten.
  for (const f of ["ai-bild.mjs", "bilder.mjs"]) {
    const kod = readFileSync(join(ROT, "scripts", "lib", f), "utf8");
    for (const m of kod.match(/gpt-image-[\w.-]+|dall-e[\w.-]*/gi) ?? []) assert.equal(m.replace(/\.$/, ""), "gpt-image-2.6-flare", `${f}: ${m}`);
  }
});

test("båda bildstilarna förbjuder verkliga personer, platser, text och den verkliga händelsen", () => {
  for (const stil of ["illustration", "foto"]) {
    const p = byggPrompt("an otter swimming in a clear river", "djur-natur", stil);
    assert.match(p, /otter/);
    assert.match(p, /No identifiable people/);
    assert.match(p, /No text/);
    assert.match(p, /do not recreate a specific real event/i);
    assert.match(p, /identifiable real landmarks or named buildings/);
  }
  assert.match(byggPrompt("x", "miljo", "foto"), /Hyperrealistic/);
  assert.match(byggPrompt("x", "miljo", "illustration"), /never as a photograph/);
});

test("skapade bilder visas med bildtexten, och schemat har ImageObject med caption", () => {
  const sida = readFileSync(join(ROT, "src", "pages", "[kategori]", "[slug].astro"), "utf8");
  assert.match(sida, /b\.genererad \|\| b\.illustration\s*\?\s*<>\{BILDTEXT_GENERERAD\}<\/>/);
  const ld = readFileSync(join(ROT, "src", "lib", "ld.js"), "utf8");
  assert.match(ld, /"@type": "ImageObject"/);
  assert.match(ld, /caption: genererad \? BILDTEXT_GENERERAD/);
  assert.ok(BILDTEXT_GENERERAD.length > 0 && !/\bAI\b/.test(BILDTEXT_GENERERAD));
});
