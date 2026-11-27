// Skriver dist/_redirects efter bygget: äkta 301 för varje gammal URL som inte längre finns.
// Körs efter varje astro build (integrationen i astro.config.mjs, även i nattbyggets "npx astro build"), så filen följer datan: en butik som får tillbaka sin sida
// försvinner ur listan samma natt. Samma upplägg som sites/bensinstationer/scripts/omdirigeringar.mjs.
//
// Underlag: data/gamla-url.txt = alla URL:er i sitemapen före sammanslagningen 2026-11-27 (1 117 st, fryst),
// plus de sidor som hade visningar i Search Console 18–27 nov (samma lista, kontrollerat).
// Mål:
//   /<kommun>/<butik>/ → /<kommun>/ om kommunsidan finns (butiken står kvar där med ankare),
//                        annars länssidan (kommunen och butiken visas där)
//   /<kommun>/         → länssidan
//   övrigt             → närmaste befintliga föräldersida, annars startsidan
// Cloudflare Pages: högst 2 000 statiska + 100 dynamiska regler, 1 000 tecken per regel, och en regel följs ALLTID,
// även om en fil finns på sökvägen (developers.cloudflare.com/pages/configuration/redirects/, läst 2026-11-27).
// Därför aldrig en regel vars källa finns som sida. Alla regler här är statiska (exakta) – det enklaste som
// säkert ger 301. Varje URL får också en variant utan avslutande snedstreck.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { byggKatalog } from "@natverk/core/katalog.js";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROT, "dist");
const MAX_STATISKA = 2000, MAX_DYNAMISKA = 100;

const finns = (u) => fs.existsSync(path.join(DIST, decodeURIComponent(u), "index.html"));
const gamla = fs.readFileSync(path.join(ROT, "data/gamla-url.txt"), "utf8").split(/\r?\n/).filter(Boolean);

// Kommun-slug → läns-slug, med samma slug-regler som sajten (core/katalog.js).
const kat = byggKatalog(JSON.parse(fs.readFileSync(path.join(ROT, "data/butiker.json"), "utf8")).filter((e) => e.namn && e.kommun));
const lanFor = new Map(kat.kommuner.map((k) => [k.slug, k.lanSlug]));
const SKYDDADE = new Set(["lan", "kedja", "guider", "_astro"]);

export function malFor(u) {
  const d = u.split("/").filter(Boolean);
  if (d.length && !SKYDDADE.has(d[0])) {
    if (d.length >= 2 && finns(`/${d[0]}/`)) return `/${d[0]}/`;
    const l = lanFor.get(d[0]);
    if (l && finns(`/lan/${l}/`)) return `/lan/${l}/`;
  }
  for (let i = d.length - 1; i >= 1; i--) {
    const f = `/${d.slice(0, i).join("/")}/`;
    if (finns(f)) return f;
  }
  return "/";
}

export function skrivOmdirigeringar() {
const borta = [...new Set(gamla)].filter((u) => u.endsWith("/") && !finns(u));
const regler = borta.flatMap((u) => { const till = malFor(u); return [{ fran: u, till }, { fran: u.slice(0, -1), till }]; });

for (const r of regler) {
  if (!finns(r.till)) throw new Error(`Målet finns inte: ${r.fran} → ${r.till}`);
  if (finns(r.fran)) throw new Error(`Källan finns som sida: ${r.fran}`);
  if (`${r.fran} ${r.till} 301`.length > 1000) throw new Error(`För lång regel: ${r.fran}`);
}
if (regler.length > MAX_STATISKA) throw new Error(`${regler.length} statiska regler – Cloudflare Pages tillåter ${MAX_STATISKA}. Använd Bulk Redirects.`);

const rader = [
  "# Genereras av scripts/omdirigeringar.mjs vid varje bygge – ändra inte för hand.",
  `# ${borta.length} borttagna URL:er (kvalitetsgrinden 2026-11-27) → ${regler.length} statiska regler (med och utan snedstreck), 0 dynamiska. Gräns ${MAX_STATISKA} + ${MAX_DYNAMISKA}.`,
  ...regler.map((r) => `${r.fran} ${r.till} 301`),
];
fs.writeFileSync(path.join(DIST, "_redirects"), rader.join("\n") + "\n");
return console.log(`_redirects: ${borta.length} borttagna URL:er → ${regler.length} statiska regler (gräns ${MAX_STATISKA} + ${MAX_DYNAMISKA}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) skrivOmdirigeringar();
