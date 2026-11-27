// Kända personer födda varje dag och historiska händelser, ur avsnitten "Födda" och "Händelser" i svenska
// Wikipedias datumartiklar ("26 november"). För dagar utan namn i almanackan hämtas också inledningen till
// artikeln om helgdagen (t.ex. Juldagen) via Wikipedias REST-API.
// Licens CC BY-SA 4.0 – källa och licens anges på datumsidorna. Vi väljer i första hand svenska personer
// (beskrivningen innehåller "svensk"), högst 8 per dag, och sparar namn, födelseår och beskrivning ordagrant.
import { hamta, skrivJson, lasJson, MANADER } from "./lib.mjs";
const UTAN = lasJson("namnlangd.json")?.utanNamn ?? {};

const API = "https://sv.wikipedia.org/w/api.php";
const ren = (s) => s
  .replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/<[^>]+>/g, "")
  .replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'{2,}/g, "").replace(/\s+/g, " ").trim();

/** Delar text i meningar utan att dela vid förkortningar som "f. Kr.", "t.ex." och "bl.a.". */
const FORK = /(?:^|\s)(?:f|e|Kr|t\.ex|bl\.a|d\.v\.s|ca|St|S:t|nr|kap|jfr)\.$/;
export function meningar(text) {
  const delar = (text ?? "").split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ"])/);
  const ut = [];
  for (const d of delar) (ut.length && FORK.test(ut.at(-1)) ? (ut[ut.length - 1] += " " + d) : ut.push(d));
  return ut.map((x) => x.trim()).filter(Boolean);
}

async function helgtext(k) {
  const helg = UTAN[k].split(" –")[0].replace(/\s*\(.*\)$/, "");
  const sum = await hamta(`https://sv.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(helg.replace(/ /g, "_"))}`, { json: true, paus: 2000 });
  const m = meningar(sum.extract);
  return m.length ? { titel: sum.title, url: sum.content_urls?.desktop?.page, text: m.slice(0, 2).join(" ") } : null;
}

// --helg: uppdatera bara helgtexterna i befintlig fil (snabbt).
if (process.argv.includes("--helg")) {
  const fil = lasJson("wikipedia-datum.json");
  for (const k of Object.keys(UTAN)) { const h = await helgtext(k); if (h && fil.dagar[k]) fil.dagar[k].helg = h; }
  skrivJson("wikipedia-datum.json", fil);
  console.log("Helgtexter uppdaterade");
  process.exit(0);
}

const ut = {};
const pad = (n) => String(n).padStart(2, "0");
for (let m = 1; m <= 12; m++) {
  const dagar = new Date(Date.UTC(2024, m, 0)).getUTCDate();
  for (let d = 1; d <= dagar; d++) {
    const titel = `${d} ${MANADER[m - 1]}`;
    const q = new URLSearchParams({ action: "parse", format: "json", formatversion: "2", prop: "wikitext", page: titel, redirects: "1" });
    let wt = "";
    try { wt = (await hamta(`${API}?${q}&maxlag=5`, { json: true, paus: 2000 })).parse?.wikitext ?? ""; } catch { console.log(`fel: ${titel}`); continue; }
    const avsn = wt.split(/\n==\s*Födda\s*==\s*\n/)[1]?.split(/\n==[^=]/)[0] ?? "";
    const rader = avsn.split("\n").filter((r) => /^\*\s*\[\[\d{3,4}\]\]/.test(r)).map((r) => {
      const ar = Number(r.match(/\[\[(\d{3,4})\]\]/)[1]);
      const resten = ren(r.replace(/^\*\s*\[\[\d{3,4}\]\]\s*[–-]\s*/, ""));
      const [namn, ...beskr] = resten.split(", ");
      return { ar, namn: namn.trim(), beskr: beskr.join(", ").replace(/\s*\([^)]*\d{3,4}[^)]*\)\s*$/, "").trim() };
    }).filter((x) => x.namn && x.beskr && x.namn.length < 60);
    const hAvsn = wt.split(/\n==\s*Händelser\s*==\s*\n/)[1]?.split(/\n==[^=]/)[0] ?? "";
    const hRader = hAvsn.split("\n").filter((r) => /^\*\s*\[\[\d{3,4}\]\]\s*[–-]/.test(r)).map((r) => ({ ar: Number(r.match(/\[\[(\d{3,4})\]\]/)[1]), text: ren(r.replace(/^\*\s*\[\[\d{3,4}\]\]\s*[–-]\s*/, "")) })).filter((x) => x.text.length > 15 && x.text.length < 260);
    const hSv = hRader.filter((x) => /Sverige|svensk|Stockholm|Göteborg|Malmö|Uppsala|riksdag/i.test(x.text));
    const hOvr = hRader.filter((x) => !hSv.includes(x));
    const svenska = rader.filter((x) => /svensk/i.test(x.beskr));
    const ovriga = rader.filter((x) => !/svensk/i.test(x.beskr));
    const sprid = (xs, k) => (xs.length <= k ? xs : Array.from({ length: k }, (_, i) => xs[Math.floor((i * xs.length) / k)]));
    const val = [...sprid(svenska, 6), ...sprid(ovriga, 8 - Math.min(6, svenska.length))].sort((a, b) => a.ar - b.ar);
    const handelser = [...sprid(hSv, 5), ...sprid(hOvr, 8 - Math.min(5, hSv.length))].sort((a, b) => a.ar - b.ar);
    const k = `${pad(m)}-${pad(d)}`;
    ut[k] = { url: `https://sv.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, "_"))}`, fodda: val, handelser };
    if (UTAN[k]) {
      try { const h = await helgtext(k); if (h) ut[k].helg = h; } catch { console.log(`fel: helgtext ${k}`); }
    }
  }
  process.stdout.write(`${MANADER[m - 1]} `);
}
skrivJson("wikipedia-datum.json", {
  kalla: "Svenska Wikipedia, datumartiklar (avsnitten Födda och Händelser)",
  licens: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.sv)",
  hamtad: new Date().toISOString().slice(0, 10),
  dagar: ut,
});
console.log(`\nSparade data/wikipedia-datum.json (${Object.keys(ut).length} dagar)`);
