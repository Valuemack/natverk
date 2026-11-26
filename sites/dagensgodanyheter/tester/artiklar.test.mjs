// Kontrollerar att varje sparad artikel har rätt form, så att ett trasigt nattbygge inte publicerar något halvfärdigt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KAT_SLUGS } from "../src/lib/kategorier.js";
import { antalOrd } from "../scripts/lib/kontroll.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const filer = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];

test("artikelfilerna har rätt form", () => {
  const slugar = new Set();
  for (const f of filer) {
    const a = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const vad = `${f}:`;
    assert.ok(KAT_SLUGS.includes(a.kategori), `${vad} kategori`);
    assert.match(a.slug, /^[a-z0-9-]{8,80}$/, `${vad} slug`);
    assert.ok(!slugar.has(`${a.kategori}/${a.slug}`), `${vad} dubblett`);
    slugar.add(`${a.kategori}/${a.slug}`);
    for (const falt of ["rubrik", "ingress", "varfor", "beskrivning", "publicerad", "uppdaterad"]) assert.ok(a[falt], `${vad} ${falt}`);
    assert.ok(!Number.isNaN(Date.parse(a.publicerad)), `${vad} datum`);
    assert.ok(a.avsnitt.length >= 2, `${vad} avsnitt`);
    assert.ok(a.faktaruta.punkter.length >= 3, `${vad} faktaruta`);
    const ord = antalOrd(a);
    assert.ok(ord >= 300 && ord <= 700, `${vad} ${ord} ord`);
    assert.match(a.kalla.url, /^https:\/\//, `${vad} källänk`);
    assert.ok(a.kalla.namn && a.kalla.id, `${vad} källnamn`);
    if (a.bildmotiv !== undefined) assert.ok(typeof a.bildmotiv === "string" && a.bildmotiv.length <= 300, `${vad} bildmotiv`);
    if (a.bild) {
      assert.ok(a.bild.alt, `${vad} alt-text`);
      assert.ok(existsSync(join(ROT, "public", a.bild.fil)), `${vad} bildfil saknas`);
      assert.ok(a.bild.licens, `${vad} bildlicens`);
      if (a.bild.illustration) assert.equal(a.bild.licens, "Illustration: Dagens goda nyheter", `${vad} märkning`);
      else assert.ok(a.bild.fotograf && a.bild.kallaUrl, `${vad} fotograf/källa`);
    }
  }
});

test("Världen i siffror: varje punkt har siffra, text, år och källa", () => {
  const fil = join(ROT, "data", "varlden-i-siffror.json");
  if (!existsSync(fil)) return;
  const { punkter } = JSON.parse(readFileSync(fil, "utf8"));
  assert.ok(punkter.length >= 7, "minst en vecka med siffror");
  for (const p of punkter) {
    assert.ok(p.rubrik && p.siffra && p.text && p.ar, p.rubrik);
    assert.ok(["varlden", "sverige"].includes(p.omrade), p.rubrik);
    assert.ok(p.kalla?.namn && /^https:\/\//.test(p.kalla.url), p.rubrik);
    assert.doesNotMatch(p.text, /aldrig varit bättre/i, p.rubrik);
  }
});
