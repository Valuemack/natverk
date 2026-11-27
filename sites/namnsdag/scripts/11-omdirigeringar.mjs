// Körs före bygget (prebuild). Två saker, båda enligt SEO-playbook §0 (inga tunna sidor, aldrig noindex):
//  1. data/sammanslagna.json: almanacksnamn med högst två unika datablock (eller under 50 bärare utan nyfödda och kända personer). De får ingen egen namnsida utan ett
//     avsnitt på sin datumsida (#slug). Läses av src/site.js (SAMMANSLAGNA).
//  2. public/_redirects (Cloudflare Pages, 301): fasta sammanslagningar, sammanslagna almanacksnamn och alla namn
//     utan namnsdag som kvalitetsgrinden i src/lib/namndata.js (OMDIRIGERADE) inte ger en egen sida.
import { register } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROT } from "./lib.mjs";

process.chdir(ROT);
register("./test/json-hook.mjs", new URL("../", import.meta.url));
const { ALLA_NAMN, SCB_ALLA, dagHref } = await import("../src/site.js");
const N = await import("../src/lib/namndata.js");

// 1. Almanacksnamn: datablock = SCB (tilltals- eller förnamn), nyfödda (minst 3 år), betydelse, kända personer (minst 3),
//    samma namn i andra former, namnsdag i andra länder. Högst två → avsnitt på datumsidan.
const MAX_BLOCK_SAMMAN = 2;
const samman = {};
for (const n of ALLA_NAMN) {
  if (!SCB_ALLA[n.namn]) continue; // saknas helt i SCB: slås alltid ihop (site.js)
  const s = N.scb(n.namn);
  const b = [(s?.tilltal ?? 0) > 0 || (s?.fornamn ?? 0) > 0, N.nyfodda(n.namn).filter((r) => r.x > 0).length >= 3, !!N.ursprung(n.namn), N.kandaPersoner(n.namn).length >= 3, N.sammaNamn(n.namn).length > 0, N.utlandskaDagar(n.namn).length > 0];
  const antal = b.filter(Boolean).length;
  // Under 50 bärare av tilltalsnamnet och varken nyfödda eller kända personer: sidan blir bara en definition och en
  // liten siffra (Tiburtius, Åslög). Samma avsnitt på datumsidan visar allt som finns.
  const pytteliten = (s?.tilltal ?? 0) < 50 && !b[1] && !b[3];
  if (antal <= MAX_BLOCK_SAMMAN || pytteliten) samman[n.namn] = { datum: n.datum, block: antal, pytteliten };
}
writeFileSync(join(ROT, "data", "sammanslagna.json"), JSON.stringify({
  kalla: "scripts/11-omdirigeringar.mjs – almanacksnamn med högst två unika datablock, eller under 50 bärare utan nyfödda och kända personer",
  namn: Object.fromEntries(Object.entries(samman).map(([k, v]) => [k, v.datum])),
}, null, 1) + "\n");

// 2. _redirects. Bara statiska regler: Cloudflare Pages tillåter 2 000 statiska men bara 100 dynamiska (med *).
// Under /namn/<slug>/ finns bara sidan och kalenderfilen.
const statiska = (slug, mal) => [`/namn/${slug} ${mal} 301`, `/namn/${slug}/ ${mal} 301`, `/namn/${slug}/kalender.ics ${mal} 301`];
const rader = [
  "# Skapad av scripts/11-omdirigeringar.mjs – ändra inte för hand.",
  "# 301 för sidor som slagits ihop (ägarens regel 2026-11-27: inga tunna sidor, ingen noindex).",
  "",
  "# Integritet och cookies är ett avsnitt på Om-sidan.",
  "/integritet /om/ 301",
  "/integritet/ /om/ 301",
  "# \"Namnsdag imorgon\" fanns redan på startsidan och på morgondagens datumsida.",
  "/namnsdag-imorgon / 301",
  "/namnsdag-imorgon/ / 301",
  "",
  "# Almanacksnamn utan egen sida – ett avsnitt på datumsidan.",
];
const almSamman = ALLA_NAMN.filter((n) => !SCB_ALLA[n.namn] || samman[n.namn]);
for (const n of almSamman) {
  rader.push(`# ${n.namn}: ${!samman[n.namn] ? "saknas i SCB:s statistik" : samman[n.namn].block <= MAX_BLOCK_SAMMAN ? `${samman[n.namn].block} datablock` : "under 50 bärare, inga nyfödda eller kända personer"}`, ...statiska(n.slug, `${dagHref(n.datum)}#${n.slug}`));
}
rader.push("", `# Namn utan namnsdag som inte klarar kvalitetsgrinden (minst ${N.MIN_BLOCK} unika datablock) eller inte är namn (${N.OMDIRIGERADE.size} st).`);
for (const [namn, o] of [...N.OMDIRIGERADE].sort((a, b) => a[0].localeCompare(b[0], "sv"))) rader.push(`# ${namn}: ${o.skal}`, ...statiska(o.slug, o.mal));
writeFileSync(join(ROT, "public", "_redirects"), rader.join("\n") + "\n");
console.log(`Sammanslagna almanacksnamn: ${almSamman.length}. _redirects: ${almSamman.length + N.OMDIRIGERADE.size + 2} omdirigerade adresser.`);
