// Steg 1 i nattbygget: hämtar förstahandskällornas flöden, tar bort dubbletter och poängsätter kandidaterna.
//
//   node scripts/hamta.mjs            # hämta och poängsätt → data/raw/kandidater.json
//   node scripts/hamta.mjs --testa    # prova varje flöde och föreslå nya adresser för trasiga (skriver data/raw/flodesstatus.json)
//   node scripts/hamta.mjs --utan-ai  # bara heuristisk poäng, även om ANTHROPIC_API_KEY finns
//
// Regler: bara källorna i kallor.mjs (inga tidningar), robots.txt respekteras, högst 1 anrop/s, generisk User-Agent.
// Poängsättningen använder den billiga modellen (Claude Haiku 5.5) när ANTHROPIC_API_KEY finns.
import { likhet, SAMMA_NYHET } from "./lib/likhet.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { AKTIVA, KALLOR } from "./kallor.mjs";
import { hamta, NekadAvRobots } from "./lib/natet.mjs";
import { tolkaFlode, hittaFloden } from "./lib/rss.mjs";
import { heuristik, total } from "./lib/poang.mjs";
import { laddaEnv } from "./lib/env.mjs";
import { KAT_SLUGS } from "../src/lib/kategorier.js";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROT, "data", "raw");
const ARTIKLAR = join(ROT, "data", "artiklar");
mkdirSync(RAW, { recursive: true });
laddaEnv();

const args = process.argv.slice(2);
const TESTA = args.includes("--testa");
const UTAN_AI = args.includes("--utan-ai") || !process.env.ANTHROPIC_API_KEY;
const MAX_ALDER_DAGAR = 7;
// Kulturkällorna publicerar sällan (utställningar, fynd, arkiv); deras nyheter får vara upp till 14 dagar gamla.
const MAX_ALDER_KAT = { kultur: 14 };

export const normUrl = (u) => {
  try {
    const x = new URL(u);
    for (const p of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(p)) x.searchParams.delete(p);
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch { return u; }
};
const idAv = (u) => createHash("sha1").update(normUrl(u)).digest("hex").slice(0, 12);

// ---------- --testa ----------
if (TESTA) {
  const status = [];
  for (const k of KALLOR) {
    const rad = { id: k.id, url: k.url, ok: false, poster: 0, senaste: null, fel: null, forslag: [] };
    try {
      const svar = await hamta(k.url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
      const poster = tolkaFlode(svar.data);
      rad.ok = poster.length > 0;
      rad.poster = poster.length;
      rad.senaste = poster.map((p) => p.datum).filter(Boolean).sort().at(-1) ?? null;
      if (!rad.ok) rad.fel = "inga poster";
    } catch (e) {
      rad.fel = e instanceof NekadAvRobots ? `robots: ${e.message}` : String(e.message || e);
    }
    if (!rad.ok && !String(rad.fel).startsWith("robots")) {
      try {
        const sida = await hamta(k.hem, { accept: "text/html" });
        rad.forslag = [...new Set(hittaFloden(sida.data, sida.url))].slice(0, 5);
      } catch { /* hemsidan gick inte heller */ }
    }
    console.log(`${rad.ok ? "OK " : "FEL"} ${k.id.padEnd(20)} ${String(rad.poster).padStart(3)} poster  ${rad.senaste?.slice(0, 10) ?? "–"}  ${rad.fel ?? ""} ${rad.forslag.length ? "→ " + rad.forslag.join(" | ") : ""}`);
    status.push(rad);
  }
  writeFileSync(join(RAW, "flodesstatus.json"), JSON.stringify(status, null, 2));
  console.log(`\n${status.filter((s) => s.ok).length} av ${status.length} flöden fungerar.`);
  process.exit(0);
}

// ---------- hämtning ----------
const redanSkrivna = new Set();
if (existsSync(ARTIKLAR)) {
  for (const f of readdirSync(ARTIKLAR).filter((f) => f.endsWith(".json"))) {
    try { redanSkrivna.add(normUrl(JSON.parse(readFileSync(join(ARTIKLAR, f), "utf8")).kalla.url)); } catch { /* trasig fil hoppas över */ }
  }
}

const nu = Date.now();
const kandidater = [];
const flodesfel = [];
for (const k of AKTIVA) {
  try {
    const svar = await hamta(k.url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
    for (const p of tolkaFlode(svar.data)) {
      if (p.datum && nu - new Date(p.datum).getTime() > (MAX_ALDER_KAT[k.kat] ?? MAX_ALDER_DAGAR) * 864e5) continue;
      if (p.datum && new Date(p.datum).getTime() - nu > 864e5) continue; // framtida datum (kalenderposter)
      const url = normUrl(p.lank);
      kandidater.push({ id: idAv(url), kalla: k.id, kallnamn: k.namn, land: k.land, kat: k.kat, typ: k.typ, titel: p.titel, url, datum: p.datum, sammanfattning: p.sammanfattning, bild: p.bild, skriven: redanSkrivna.has(url) });
    }
  } catch (e) {
    flodesfel.push({ id: k.id, fel: String(e.message || e) });
  }
}

// ---------- dubbletter ----------
// Samma URL, eller nästan samma rubrik (t.ex. samma pressmeddelande via forskning.se och lärosätet): behåll den mest pålitliga källan.
const tillit = Object.fromEntries(KALLOR.map((k) => [k.id, k.tillit]));
kandidater.sort((a, b) => (tillit[b.kalla] ?? 0) - (tillit[a.kalla] ?? 0));
const unika = [];
for (const c of kandidater) {
  const dubblett = unika.find((u) => u.url === c.url || likhet(u.titel, c.titel) >= SAMMA_NYHET);
  if (dubblett) { (dubblett.aven ??= []).push({ kalla: c.kalla, url: c.url }); continue; }
  unika.push(c);
}

// ---------- poäng ----------
const kallaAv = Object.fromEntries(KALLOR.map((k) => [k.id, k]));
for (const c of unika) {
  c.poang = heuristik(c, kallaAv[c.kalla], nu);
  c.poang.total = total(c.poang);
}
unika.sort((a, b) => b.poang.total - a.poang.total);

if (!UTAN_AI) {
  const { bedomKandidater } = await import("./lib/ai-poang.mjs");
  const urval = unika.filter((c) => !c.skriven).slice(0, 80);
  try {
    const { bedomda, kostnad } = await bedomKandidater(urval);
    for (const c of urval) {
      const b = bedomda.get(c.id);
      if (!b) continue;
      c.poang.positiv = b.positiv / 10;
      c.poang.betydelse = b.betydelse / 10;
      c.poang.metod = "claude-haiku-5-5";
      c.lamplig = b.lamplig;
      c.skal = b.skal;
      if (KAT_SLUGS.includes(b.kategori)) c.kat = b.kategori;
      c.poang.total = total(c.poang);
    }
    console.log(`AI-poängsättning: ${bedomda.size} kandidater, cirka $${kostnad.toFixed(4)}`);
  } catch (e) {
    console.error(`AI-poängsättningen misslyckades, heuristiken används: ${e.message}`);
  }
  unika.sort((a, b) => b.poang.total - a.poang.total);
}

writeFileSync(join(RAW, "kandidater.json"), JSON.stringify({ hamtad: new Date(nu).toISOString(), antal: unika.length, flodesfel, kandidater: unika }, null, 2));
const perKat = Object.fromEntries(KAT_SLUGS.map((s) => [s, unika.filter((c) => c.kat === s && !c.skriven).length]));
console.log(`${unika.length} unika kandidater (${kandidater.length - unika.length} dubbletter borttagna) från ${AKTIVA.length - flodesfel.length} av ${AKTIVA.length} flöden.`);
console.log("Per kategori:", perKat);
if (flodesfel.length) console.log("Flöden med fel:", flodesfel.map((f) => f.id).join(", "));
console.log("Topp 10:");
for (const c of unika.filter((c) => !c.skriven).slice(0, 10)) console.log(`  ${String(c.poang.total).padStart(3)}  [${c.kat}] ${c.titel.slice(0, 90)} (${c.kalla})`);
