// Skriver äkta 301:or efter bygget för varje gammal URL som inte längre finns (beslut 2026-11-27, SEO-playbook §0).
// Körs av "npm run build" efter astro build, så filerna följer datan: en parkering som får egen sida igen försvinner
// ur listorna samma natt.
//
// Underlag: data/gamla-url.txt = alla HTML-sidor i dist före rensningen (2026-11-27, 5 112 st, fryst).
// Mål:
//   /<kommun>/<parkering>/      → /<kommun>/ om kommunsidan finns, annars länssidan /lan/<län>/ (raden finns där med ankare)
//   /<kommun>/                  → /lan/<län>/ (kommunen har en egen sektion där)
//   /flygplatsparkering/<x>/    → /flygplatsparkering/
//   övrigt                      → närmaste befintliga föräldersida, annars /
//
// Mekanism (Cloudflare Pages, kontrollerat i developers.cloudflare.com/pages/configuration/redirects/ 2026-11-27):
//   _redirects tillåter 2 000 statiska + 100 dynamiska regler, och en regel följs alltid, även om en fil finns.
//   Här behövs fler än 2 000, så de kommuner som har flest borttagna sidor hanteras av en liten worker (dist/_worker.js,
//   Pages "advanced mode") som svarar 301 och annars lämnar över till de statiska filerna (env.ASSETS). dist/_routes.json
//   begränsar workern till de kommunerna, så övriga sidor serveras statiskt utan anrop. Workern har ändå HELA kartan,
//   så omdirigeringarna fungerar även om _routes.json skulle ignoreras. Inga regler pekar på en sida som saknas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROT, "dist");
const MAX_STATISKA = 2000, MAX_DYNAMISKA = 100, MAX_ROUTES = 100, MARGINAL = 100;
process.chdir(ROT); // site.js läser data relativt sajtmappen
const { KAT } = await import(pathToFileURL(path.join(ROT, "src/site.js")).href);

const finns = (u) => fs.existsSync(path.join(DIST, decodeURIComponent(u), "index.html"));
const gamla = fs.readFileSync(path.join(ROT, "data/gamla-url.txt"), "utf8").split(/\r?\n/).filter(Boolean);
const lanFor = new Map(KAT.kommuner.map((k) => [k.slug, `/lan/${k.lanSlug}/`]));

export function malFor(u) {
  const d = u.split("/").filter(Boolean);
  if (d[0] === "flygplatsparkering") return "/flygplatsparkering/";
  if (lanFor.has(d[0])) {
    if (d.length >= 2 && finns(`/${d[0]}/`)) return `/${d[0]}/`;
    if (finns(lanFor.get(d[0]))) return lanFor.get(d[0]);
  }
  for (let i = d.length - 1; i >= 1; i--) { const f = `/${d.slice(0, i).join("/")}/`; if (finns(f)) return f; }
  return "/";
}

const regler = gamla.filter((u) => !finns(u)).map((u) => ({ fran: u, till: malFor(u) }));
for (const r of regler) {
  if (!finns(r.till)) throw new Error(`Målet finns inte: ${r.fran} → ${r.till}`);
  if (finns(r.fran)) throw new Error(`Källan finns som sida: ${r.fran}`);
}

// Gruppera undersidor per första segment.
const forsta = (u) => u.split("/").filter(Boolean)[0] ?? "";
const undersidor = (k) => fs.existsSync(path.join(DIST, k)) && fs.readdirSync(path.join(DIST, k), { withFileTypes: true }).some((x) => x.isDirectory());
const perSeg = new Map();
for (const r of regler) { const s = forsta(r.fran); if (!perSeg.has(s)) perSeg.set(s, []); perSeg.get(s).push(r); }

// 1) Dynamiska regler: kommuner utan kvarvarande undersidor där alla undersidor har samma mål.
const dynamiska = [];
for (const [s, rs] of perSeg) {
  const under = rs.filter((r) => r.fran.split("/").filter(Boolean).length === 2);
  if (!lanFor.has(s) || under.length < 2 || undersidor(s) || new Set(under.map((r) => r.till)).size !== 1) continue;
  dynamiska.push({ seg: s, till: under[0].till, tackta: new Set(under.map((r) => r.fran)), n: under.length });
}
dynamiska.sort((a, b) => b.n - a.n);
const valdaDyn = dynamiska.slice(0, MAX_DYNAMISKA);
const tacktaDyn = new Set(valdaDyn.flatMap((d) => [...d.tackta]));
let statiska = regler.filter((r) => !tacktaDyn.has(r.fran));

// 2) Worker för segmenten med flest statiska regler tills resten ryms med marginal.
const antalPerSeg = new Map();
for (const r of statiska) antalPerSeg.set(forsta(r.fran), (antalPerSeg.get(forsta(r.fran)) ?? 0) + 1);
const workerSeg = [];
let kvar = statiska.length;
for (const [s, n] of [...antalPerSeg.entries()].sort((a, b) => b[1] - a[1])) {
  if (kvar <= MAX_STATISKA - MARGINAL) break;
  if (!lanFor.has(s)) continue; // bara kommunprefix
  workerSeg.push(s); kvar -= n;
}
if (workerSeg.length > MAX_ROUTES - 5) throw new Error(`${workerSeg.length} worker-prefix – _routes.json tillåter ${MAX_ROUTES} regler.`);
const iWorker = new Set(workerSeg);
// Dynamiska regler för worker-segment flyttas inte (de segmenten har undersidor kvar och är därför aldrig dynamiska).
statiska = statiska.filter((r) => !iWorker.has(forsta(r.fran)));
if (statiska.length > MAX_STATISKA) throw new Error(`${statiska.length} statiska regler – gränsen är ${MAX_STATISKA}.`);

const rader = [
  "# Genereras av scripts/omdirigeringar.mjs vid varje bygge – ändra inte för hand.",
  `# ${regler.length} borttagna URL:er: ${statiska.length} statiska + ${valdaDyn.length} dynamiska regler här, ${regler.length - statiska.length - [...tacktaDyn].length} i _worker.js (${workerSeg.join(", ") || "inga"}).`,
  ...statiska.map((r) => `${r.fran} ${r.till} 301`),
  ...valdaDyn.map((d) => `/${d.seg}/:parkering/ ${d.till} 301`),
];
fs.writeFileSync(path.join(DIST, "_redirects"), rader.join("\n") + "\n");

// Workern: hela kartan (alla borttagna URL:er), så att 301:orna gäller oavsett hur Pages routar.
const karta = Object.fromEntries(regler.map((r) => [r.fran, r.till]));
const worker = `// Genereras av scripts/omdirigeringar.mjs – ändra inte för hand. Äkta 301 för borttagna sidor, annars statiska filer.
const R = ${JSON.stringify(karta)};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const till = R[p] ?? (p.endsWith("/") ? undefined : R[p + "/"]);
    if (till) return new Response(null, { status: 301, headers: { Location: url.origin + till, "Cache-Control": "public, max-age=86400" } });
    return env.ASSETS.fetch(request);
  },
};
`;
fs.writeFileSync(path.join(DIST, "_worker.js"), worker);
fs.writeFileSync(path.join(DIST, "_routes.json"), JSON.stringify({ version: 1, include: workerSeg.length ? workerSeg.map((s) => `/${s}/*`) : ["/__ingen-worker/*"], exclude: ["/_astro/*"] }, null, 2) + "\n");
console.log(`_redirects: ${regler.length} borttagna URL:er → ${statiska.length} statiska + ${valdaDyn.length} dynamiska regler; _worker.js: ${workerSeg.length} kommuner (${workerSeg.join(", ")}), ${Object.keys(karta).length} URL:er i kartan.`);
