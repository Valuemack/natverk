// Kända personer födda varje dag, ur avsnittet "Födda" i svenska Wikipedias datumartiklar ("26 november").
// Licens CC BY-SA 4.0 – källa och licens anges på datumsidorna. Vi väljer i första hand svenska personer
// (beskrivningen innehåller "svensk"), högst 8 per dag, och sparar namn, födelseår och beskrivning ordagrant.
import { hamta, skrivJson, MANADER } from "./lib.mjs";

const API = "https://sv.wikipedia.org/w/api.php";
const ren = (s) => s
  .replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/<[^>]+>/g, "")
  .replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'{2,}/g, "").replace(/\s+/g, " ").trim();

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
    const svenska = rader.filter((x) => /svensk/i.test(x.beskr));
    const ovriga = rader.filter((x) => !/svensk/i.test(x.beskr));
    const sprid = (xs, k) => (xs.length <= k ? xs : Array.from({ length: k }, (_, i) => xs[Math.floor((i * xs.length) / k)]));
    const val = [...sprid(svenska, 6), ...sprid(ovriga, 8 - Math.min(6, svenska.length))].sort((a, b) => a.ar - b.ar);
    ut[`${pad(m)}-${pad(d)}`] = { url: `https://sv.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, "_"))}`, fodda: val };
  }
  process.stdout.write(`${MANADER[m - 1]} `);
}
skrivJson("wikipedia-datum.json", {
  kalla: "Svenska Wikipedia, datumartiklar (avsnittet Födda)",
  licens: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.sv)",
  hamtad: new Date().toISOString().slice(0, 10),
  dagar: ut,
});
console.log(`\nSparade data/wikipedia-datum.json (${Object.keys(ut).length} dagar)`);
