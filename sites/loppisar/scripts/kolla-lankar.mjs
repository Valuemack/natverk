// Kontroll efter bygget: alla interna länkar i dist pekar på en sida som finns (och ett ankare som finns),
// ingen länk går till en omdirigerad URL och sitemapen innehåller bara befintliga sidor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const sidor = [];
(function gå(d) { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); if (x.isDirectory()) gå(p); else if (x.name.endsWith(".html")) sidor.push(p); } })(DIST);
const html = new Map(sidor.map((p) => [("/" + path.relative(DIST, p).split(path.sep).join("/")).replace(/index\.html$/, ""), fs.readFileSync(p, "utf8")]));
const ids = new Map([...html].map(([u, h]) => [u, new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
const omdir = new Set(fs.existsSync(path.join(DIST, "_redirects")) ? fs.readFileSync(path.join(DIST, "_redirects"), "utf8").split("\n").filter((r) => r && !r.startsWith("#")).map((r) => r.split(" ")[0]) : []);
const fel = [];
let antal = 0;
for (const [fran, h] of html) {
  for (const m of h.matchAll(/href="([^"]+)"/g)) {
    let u = m[1].replace(/&amp;/g, "&");
    if (u.includes("${")) continue; // mall i inline-skript
    if (/^(https?:|mailto:|tel:|\/\/)/.test(u) && !u.startsWith("https://loppisar.nu")) continue;
    u = u.replace("https://loppisar.nu", "");
    if (u.startsWith("/_astro/") || /\.(svg|xml|json|txt|css|js)$/.test(u.split("#")[0])) continue;
    const [sokv, ank] = u.split("#");
    const mal = sokv === "" ? fran : sokv;
    antal++;
    if (mal === "/404/" && html.has("/404.html")) continue;
    if (omdir.has(mal)) fel.push(`${fran} → ${u} (omdirigerad)`);
    else if (!html.has(mal)) fel.push(`${fran} → ${u} (saknas)`);
    else if (ank && !ids.get(mal).has(decodeURIComponent(ank))) fel.push(`${fran} → ${u} (ankare saknas)`);
  }
}
const sm = fs.readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f)).flatMap((f) => [...fs.readFileSync(path.join(DIST, f), "utf8").matchAll(/<loc>https:\/\/loppisar\.nu([^<]*)<\/loc>/g)].map((m) => m[1]));
for (const u of sm) if (!html.has(u) || omdir.has(u)) fel.push(`sitemap: ${u}`);
console.log(`${html.size} html-sidor, ${sm.length} i sitemap, ${antal} interna länkar kontrollerade, ${fel.length} fel.`);
for (const f of [...new Set(fel)].slice(0, 40)) console.log(" ", f);
process.exitCode = fel.length ? 1 : 0;
