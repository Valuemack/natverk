// Ärliga ändringssignaler: sitemap-lastmod + IndexNow (Bing, Yandex, Seznam, Naver m.fl.).
//
//   node packages/core/scripts/indexnow.mjs sites/<sajt>            # efter build, före deploy
//   node packages/core/scripts/indexnow.mjs sites/<sajt> --skicka   # efter deploy
//
// Steg 1 (före deploy):
//   - hashar <main> på varje sida (utan "Uppdaterad"-raden)
//   - hämtar förra publicerade dist/indexnow.json från sajten och jämför
//   - sätter <lastmod> i sitemapen till dagen då sidans innehåll senast ändrades
//   - skriver nytt indexnow.json (+ nyckelfil om INDEXNOW_KEY finns)
// Steg 2 (efter deploy): skickar bara nya/ändrade URL:er till IndexNow. Kräver INDEXNOW_KEY.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const sajtDir = process.argv[2];
const skicka = process.argv.includes("--skicka");
const nyckel = process.env.INDEXNOW_KEY;
const nyckelOk = !!nyckel && /^[a-zA-Z0-9-]{8,128}$/.test(nyckel);
if (!sajtDir) throw new Error("Ange sajtmapp, t.ex. sites/rodadagar");

const dist = join(sajtDir, "dist");
const andradeFil = join(sajtDir, ".indexnow-andrade.json"); // utanför dist så den inte publiceras
const idag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

const sitemaps = readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f));
const urlar = sitemaps.flatMap((f) => [...readFileSync(join(dist, f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
if (!urlar.length) throw new Error("Hittade inga URL:er i sitemap");
const host = new URL(urlar[0]).host;

function hashFor(url) {
  const sokvag = decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
  const fil = join(dist, sokvag, sokvag.endsWith(".html") ? "" : "index.html");
  if (!existsSync(fil)) return null;
  const html = readFileSync(fil, "utf8");
  const main = (html.match(/<main[\s\S]*<\/main>/) || [html])[0].replace(/<p class="uppdaterad">[\s\S]*?<\/p>/, "");
  return createHash("sha1").update(main).digest("hex").slice(0, 16);
}

if (!skicka) {
  let forra = {};
  try {
    const svar = await fetch(`https://${host}/indexnow.json`, { signal: AbortSignal.timeout(15000) });
    if (svar.ok) forra = await svar.json();
  } catch { /* första publiceringen eller sajten nere – allt räknas som nytt */ }

  const manifest = {};
  const andrade = [];
  for (const u of urlar) {
    const h = hashFor(u);
    const f = typeof forra[u] === "string" ? { h: forra[u] } : forra[u];
    const oforandrad = f && f.h === h;
    manifest[u] = { h, d: oforandrad && f.d ? f.d : idag };
    if (!oforandrad) andrade.push(u);
  }
  writeFileSync(join(dist, "indexnow.json"), JSON.stringify(manifest));
  writeFileSync(andradeFil, JSON.stringify(andrade));
  if (nyckelOk) writeFileSync(join(dist, `${nyckel}.txt`), nyckel);

  // Sätt <lastmod> per URL i sitemapen (ersätter ev. befintlig).
  for (const f of sitemaps) {
    const p = join(dist, f);
    const xml = readFileSync(p, "utf8")
      .replace(/<lastmod>[^<]*<\/lastmod>/g, "")
      .replace(/<loc>([^<]+)<\/loc>/g, (m, u) => (manifest[u] ? `${m}<lastmod>${manifest[u].d}</lastmod>` : m));
    writeFileSync(p, xml);
  }
  console.log(`${host}: ${urlar.length} URL:er, ${andrade.length} nya/ändrade. Sitemap-lastmod satt.`);
  process.exit(0);
}

if (!nyckelOk) {
  console.log("INDEXNOW_KEY saknas eller är ogiltig – hoppar över IndexNow-ping.");
  process.exit(0);
}
const andrade = existsSync(andradeFil) ? JSON.parse(readFileSync(andradeFil, "utf8")) : [];
console.log(`${andrade.length} av ${urlar.length} URL:er skickas till IndexNow`);
for (let i = 0; i < andrade.length; i += 10000) {
  const svar = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: nyckel, keyLocation: `https://${host}/${nyckel}.txt`, urlList: andrade.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: HTTP ${svar.status}`);
}
