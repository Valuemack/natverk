// Skriver dist/_redirects efter bygget: äkta 301 för varje gammal URL som inte längre finns.
// Körs automatiskt av "npm run build" (efter astro build) och i nattbygget, så filen följer alltid datan:
// en station som får en egen sida igen tas bort ur listan samma natt som sidan kommer tillbaka.
//
// Underlag: data/gamla-url.txt = alla URL:er i sitemapen före sammanslagningen (2026-11-23, 3 500 st, fryst).
// Mål:
//   /<kommun>/<station>/  → /<kommun>/   (stationen finns kvar som rad med ankare på kommunsidan)
//   övrigt                → närmaste befintliga föräldersida, annars startsidan
// Cloudflare Pages tillåter 2 000 statiska + 100 dynamiska regler, och en regel följs ALLTID, även om en fil finns
// (developers.cloudflare.com/pages/configuration/redirects/). Därför:
//   - aldrig en regel vars källa är en sida som finns,
//   - en dynamisk regel "/<kommun>/:station/ /<kommun>/ 301" bara för kommuner där ingen stationssida finns kvar,
//   - resten som statiska regler. Blir det för många avbryts bygget (hellre ett stoppat bygge än tysta 404:or).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROT, "dist");
const MAX_STATISKA = 2000, MAX_DYNAMISKA = 100;

const finns = (u) => fs.existsSync(path.join(DIST, decodeURIComponent(u), "index.html")) || (!u.endsWith("/") && fs.existsSync(path.join(DIST, decodeURIComponent(u))));
const gamla = fs.readFileSync(path.join(ROT, "data/gamla-url.txt"), "utf8").split(/\r?\n/).filter(Boolean);

export function malFor(u) {
  const delar = u.split("/").filter(Boolean);
  for (let i = delar.length - 1; i >= 1; i--) {
    const f = `/${delar.slice(0, i).join("/")}/`;
    if (finns(f)) return f;
  }
  return "/";
}

const borta = gamla.filter((u) => !finns(u));
const regler = borta.map((u) => ({ fran: u, till: malFor(u) }));

// Kommuner (första segmentet) där inga undersidor finns kvar i dist: en dynamisk regel räcker för alla deras stationer.
const SKYDDADE = new Set(["lan", "kedja", "drivmedel", "historik", "europa", "guider", "data", "_astro"]);
const perKommun = new Map();
for (const r of regler) {
  const d = r.fran.split("/").filter(Boolean);
  if (d.length !== 2 || SKYDDADE.has(d[0]) || r.till !== `/${d[0]}/`) continue;
  if (!perKommun.has(d[0])) perKommun.set(d[0], []);
  perKommun.get(d[0]).push(r);
}
const utanUndersidor = (k) => !fs.readdirSync(path.join(DIST, k), { withFileTypes: true }).some((x) => x.isDirectory());
const dynamiska = [...perKommun.entries()].filter(([k, rs]) => rs.length >= 2 && utanUndersidor(k))
  .sort((a, b) => b[1].length - a[1].length).slice(0, MAX_DYNAMISKA);
const tackta = new Set(dynamiska.flatMap(([, rs]) => rs.map((r) => r.fran)));
const statiska = regler.filter((r) => !tackta.has(r.fran));

// Kontroller: inget mål saknas, ingen källa finns, inga kedjor av omdirigeringar.
for (const r of regler) {
  if (!finns(r.till)) throw new Error(`Målet finns inte: ${r.fran} → ${r.till}`);
  if (finns(r.fran)) throw new Error(`Källan finns som sida: ${r.fran}`);
}
if (statiska.length > MAX_STATISKA) throw new Error(`${statiska.length} statiska regler – Cloudflare Pages tillåter ${MAX_STATISKA}. Lägg resten i Bulk Redirects (scripts/drift/omdirigeringar.mjs).`);

const rader = [
  "# Genereras av scripts/omdirigeringar.mjs vid varje bygge – ändra inte för hand.",
  `# ${regler.length} borttagna URL:er: ${statiska.length} statiska regler + ${dynamiska.length} dynamiska (kommuner utan stationssidor).`,
  ...statiska.map((r) => `${r.fran} ${r.till} 301`),
  ...dynamiska.map(([k]) => `/${k}/:station/ /${k}/ 301`),
];
fs.writeFileSync(path.join(DIST, "_redirects"), rader.join("\n") + "\n");
console.log(`_redirects: ${regler.length} borttagna URL:er → ${statiska.length} statiska + ${dynamiska.length} dynamiska regler (gräns ${MAX_STATISKA} + ${MAX_DYNAMISKA}).`);
