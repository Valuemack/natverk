// Nyfödda per tilltalsnamn, år och kön för ALLA namn i SCB:s tabell BE0001Nyfodda (1998–2022, CC0).
// (02-scb.mjs hämtar bara almanackans namn.) Används för grafer på namnsidorna och babynamnsverktyget.
// SCB redovisar bara namn som minst två barn fått ett visst år; tabellen uppdateras inte längre (SCB slutade 2024).
import { hamta, skrivJson } from "./lib.mjs";

const URL = "https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0001/BE0001D/BE0001Nyfodda";
const meta = await hamta(URL, { json: true });
const namn = meta.variables.find((v) => v.code === "Tilltalsnamn").values;
const ar = meta.variables.find((v) => v.code === "Tid").values.map(Number).sort((a, b) => a - b);
const konKod = meta.variables.find((v) => v.code === "Kon");
console.log(`${namn.length} namn, år ${ar[0]}–${ar.at(-1)}, kön ${konKod.values.join("/")} = ${konKod.valueTexts.join("/")}`);
const KON = Object.fromEntries(konKod.values.map((v, i) => [v, /kvinn|flick/i.test(konKod.valueTexts[i]) ? "K" : "M"]));

const ut = {};
for (let i = 0; i < namn.length; i += 400) {
  const d = await hamta(URL, { metod: "POST", json: true, kropp: { query: [
    { code: "Tilltalsnamn", selection: { filter: "item", values: namn.slice(i, i + 400) } },
  ], response: { format: "json" } } });
  for (const r of d.data) {
    const v = r.values[0] === ".." ? 0 : Number(r.values[0]);
    if (!v) continue;
    const [n, kon, a] = r.key;
    const k = KON[kon];
    ((ut[n] ??= {})[k] ??= Array(ar.length).fill(0))[ar.indexOf(Number(a))] = v;
  }
  process.stdout.write(`${Math.min(i + 400, namn.length)} `);
}
skrivJson("nyfodda-alla.json", { kalla: "SCB, Statistikdatabasen: BE0001Nyfodda, nyfödda efter tilltalsnamn och namngivningsår (CC0)", hamtad: new Date().toISOString().slice(0, 10), ar, namn: ut });
console.log(`\nSparade data/nyfodda-alla.json (${Object.keys(ut).length} namn)`);
