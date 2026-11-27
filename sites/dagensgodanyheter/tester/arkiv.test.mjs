// Arkivet växer och krymper aldrig: varje URL som någon gång har publicerats ska finnas kvar, med samma adress.
// Registret data/publicerade.json fylls på av skrivmotorn. Faller det här testet stoppar nattbygget före publicering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const register = JSON.parse(readFileSync(join(ROT, "data", "publicerade.json"), "utf8"));
const artiklar = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

test("varje publicerad URL finns kvar med samma adress", () => {
  for (const r of register) {
    const fil = join(DIR, r.fil);
    assert.ok(existsSync(fil), `${r.href}: artikelfilen ${r.fil} saknas – artiklar får aldrig tas bort`);
    const a = JSON.parse(readFileSync(fil, "utf8"));
    assert.equal(`/${a.kategori}/${a.slug}/`, r.href, `${r.fil}: adressen har ändrats`);
    assert.equal(a.publicerad, r.publicerad, `${r.fil}: publiceringsdatumet har ändrats`);
  }
});

test("varje artikel står i registret", () => {
  const hrefar = new Set(register.map((r) => r.href));
  for (const { f, a } of artiklar) assert.ok(hrefar.has(`/${a.kategori}/${a.slug}/`), `${f} saknas i data/publicerade.json`);
});

test("inget skript tar bort eller flyttar artikelfiler", () => {
  const skript = [];
  const gå = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) f.isDirectory() ? gå(join(d, f.name)) : f.name.endsWith(".mjs") && skript.push(join(d, f.name)); };
  gå(join(ROT, "scripts"));
  for (const s of skript) {
    for (const rad of readFileSync(s, "utf8").split("\n")) {
      if (/\b(unlinkSync|rmSync|rmdirSync|renameSync|unlink|rm)\s*\(/.test(rad)) assert.doesNotMatch(rad, /artikl|ARTIKLAR|\bDIR\b/i, `${s}: ${rad.trim()}`);
    }
  }
});

test("skrivmotorn skriver aldrig över en befintlig artikel", () => {
  const skriv = readFileSync(join(ROT, "scripts", "skriv.mjs"), "utf8");
  assert.match(skriv, /writeFileSync\(join\(ARTIKLAR, fil\)[^\n]*flag: "wx"/);
});

test("nattbygget checkar in registret", () => {
  const wf = readFileSync(join(ROT, "..", "..", ".github", "workflows", "godanyheter.yml"), "utf8");
  assert.match(wf, /for p in [^\n]*data\/artiklar[^\n]*data\/publicerade\.json/);
});
