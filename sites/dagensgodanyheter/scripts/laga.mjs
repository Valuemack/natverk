// Lagar data som går att laga automatiskt, innan nattbyggets tester körs – så att äldre data aldrig stoppar en natt.
// Lägger bara till och rättar; tar aldrig bort en artikel, ändrar aldrig text, adress, datum eller kategori.
//
//   1. Register: artiklar som saknas i data/publicerade.json läggs till (arkivskyddet).
//   2. Alt-texter som bryter mot reglerna (src/lib/bildtext.js): först en enkel rättning (t.ex. ett gammalt
//      "Illustration:"-prefix), annars skriver Claude Haiku om texten utifrån bilden. Går det inte visas artikeln
//      utan bild (bildfälten sparas under bildBorttagen) – hellre ren text än en bild utan godkänd alt-text.
//   3. Poäng: artiklar utan glädjepoäng och nyhetstyp poängsätts med Haiku (scripts/omvardera.mjs).
//
//   node scripts/laga.mjs            # laga (steg 2–3 kräver ANTHROPIC_API_KEY, annars bara det som går utan)
//   node scripts/laga.mjs --torr     # visa vad som skulle lagas, ändra inget
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { laddaEnv } from "./lib/env.mjs";
import { altFel, enkelAlt } from "../src/lib/bildtext.js";

laddaEnv();
const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const REGISTER_FIL = join(ROT, "data", "publicerade.json");
const TORR = process.argv.includes("--torr");
const NYCKEL = Boolean(process.env.ANTHROPIC_API_KEY);
const spara = (f, a) => { if (!TORR) writeFileSync(join(DIR, f), JSON.stringify(a, null, 2) + "\n"); };
const logg = [];

const artiklar = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

// ---------- 1. register ----------
const register = existsSync(REGISTER_FIL) ? JSON.parse(readFileSync(REGISTER_FIL, "utf8")) : [];
const hrefar = new Set(register.map((r) => r.href));
let nyaIRegistret = 0;
for (const { f, a } of artiklar) {
  const href = `/${a.kategori}/${a.slug}/`;
  if (hrefar.has(href)) continue;
  register.push({ href, fil: f, publicerad: a.publicerad });
  hrefar.add(href);
  nyaIRegistret++;
}
if (nyaIRegistret && !TORR) writeFileSync(REGISTER_FIL, JSON.stringify(register, null, 2) + "\n");
if (nyaIRegistret) logg.push(`${nyaIRegistret} artiklar inlagda i registret`);

// ---------- 2. alt-texter ----------

let altRattade = 0, altModell = 0, bilderBort = 0, kostnad = 0;
for (const { f, a } of artiklar) {
  if (!a.bild?.fil || !altFel(a.bild.alt, a.rubrik)) continue;
  const enkel = enkelAlt(a.bild.alt);
  if (!altFel(enkel, a.rubrik)) { a.bild.alt = enkel; spara(f, a); altRattade++; continue; }
  if (NYCKEL && !TORR) {
    try {
      const { sakraAlt } = await import("./lib/bilder.mjs");
      const svar = await sakraAlt(readFileSync(join(ROT, "public", a.bild.fil)), enkel, { rubrik: a.rubrik, ingress: a.ingress });
      kostnad += svar.kostnad ?? 0;
      if (svar.alt && !altFel(svar.alt, a.rubrik)) { a.bild.alt = svar.alt; spara(f, a); altModell++; continue; }
    } catch (e) { console.warn(`${f}: alt-texten kunde inte skrivas om (${e.message})`); }
  }
  if (TORR) { logg.push(`${f}: alt-texten behöver skrivas om utifrån bilden`); continue; }
  if (!NYCKEL) { console.warn(`${f}: ogiltig alt-text, ANTHROPIC_API_KEY saknas – lämnas till nästa körning`); continue; }
  // Ingen godkänd alt-text: artikeln visas som ren text. Bildfilerna ligger kvar, bildfälten sparas.
  a.bildBorttagen = { ...a.bild, orsak: `ingen godkänd alt-text (${altFel(a.bild.alt, a.rubrik)})`, datum: new Date().toISOString() };
  a.bild = null;
  spara(f, a);
  bilderBort++;
}
if (altRattade) logg.push(`${altRattade} alt-texter rättade utan modell`);
if (altModell) logg.push(`${altModell} alt-texter omskrivna utifrån bilden`);
if (bilderBort) logg.push(`${bilderBort} bilder borttagna (ingen godkänd alt-text), artiklarna visas som ren text`);

// ---------- 3. poäng ----------
const utanPoang = artiklar.filter(({ a }) => a.poang?.gladje == null).length;
if (utanPoang) {
  if (NYCKEL && !TORR) {
    const r = spawnSync(process.execPath, [join(ROT, "scripts", "omvardera.mjs")], { stdio: "inherit" });
    logg.push(r.status === 0 ? `${utanPoang} artiklar poängsatta (glädje och typ)` : `poängsättningen misslyckades för ${utanPoang} artiklar`);
  } else logg.push(`${utanPoang} artiklar saknar glädjepoäng${TORR ? "" : " (ANTHROPIC_API_KEY saknas)"}`);
}

console.log(`${TORR ? "TORRLÄGE – " : ""}${logg.length ? logg.join("; ") : "inget att laga"}.${kostnad ? ` Cirka $${kostnad.toFixed(4)}.` : ""}`);
