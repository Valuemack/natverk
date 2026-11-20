// Sparar kedjornas avvikande tider (helgdagar m.m.) per datum och apotek i data/helgtider.json.
// Kedjorna visar bara de närmaste dagarna, så filen byggs på natt för natt. Den publicerade filen
// (/data/helgtider.json) är källan mellan körningarna, så historiken överlever även utan cache.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FIL = resolve("data/helgtider.json");
const URL_PUBLICERAD = "https://jourapotek.se/data/helgtider.json";
const idag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
const plus = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

let data = { datum: {} };
try {
  const r = await fetch(URL_PUBLICERAD, { headers: { "User-Agent": "Mozilla/5.0 (compatible; natverk-bygge)" } });
  if (r.ok) data = await r.json();
  else throw new Error(`HTTP ${r.status}`);
  console.log(`Hämtade publicerad historik (${Object.keys(data.datum ?? {}).length} datum).`);
} catch (e) {
  if (existsSync(FIL)) data = JSON.parse(readFileSync(FIL, "utf8"));
  console.log(`Publicerad historik saknas (${e.message}), använder lokal fil.`);
}
data.datum ??= {};

const apotek = JSON.parse(readFileSync(resolve("../apoteken/data/apotek.json"), "utf8"));
let nya = 0;
for (const a of apotek) {
  for (const av of a.avvikande_oppettider ?? []) {
    if (!av?.datum || !av.tid) continue;
    const slut = av.till ?? av.datum;
    for (let d = av.datum, i = 0; d <= slut && i < 40; d = plus(d, 1), i++) {
      if (d < plus(idag, -1)) continue; // passerade datum skrivs inte om – det som gällde sparades innan
      data.datum[d] ??= {};
      if (data.datum[d][a.id] !== av.tid) nya++;
      data.datum[d][a.id] = av.tid;
    }
  }
}
// Rensa datum äldre än 400 dagar (förra årets helgdagar behövs, äldre inte).
for (const d of Object.keys(data.datum)) if (d < plus(idag, -400)) delete data.datum[d];
data.uppdaterad = idag;
writeFileSync(FIL, JSON.stringify(data));
console.log(`helgtider.json: ${Object.keys(data.datum).length} datum, ${nya} nya eller ändrade tider.`);
