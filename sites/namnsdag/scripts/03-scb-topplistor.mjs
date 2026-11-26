// Kompletterande namnstatistik från SCB:s statistikdatabas (öppna data, CC0) för guidesidorna:
//  - Nyfödda, de 100 vanligaste tilltalsnamnen per år och kön (BE0001T05AR, 1998–2022)
//  - Folkbokförda, de 100 vanligaste tilltalsnamnen per år och kön (BE0001T06AR, 1999–2021)
//  - Alla tilltalsnamn med minst 10 bärare 2020 (BE0001TNamn10) och förnamn 2020 (BE0001FNamn10)
//  - Medelålder per tilltalsnamn 2020 (BE0001T08AR)
// SCB slutade producera namnstatistik 2024 (statistiken förs nu av Skatteverket). Tabellerna ändras inte mer.
// OBS: i topplistorna har SCB slagit ihop namn med liknande stavning (t.ex. Lea/Leah); i Namn10-tabellerna räknas varje stavning för sig.
// Resultat: data/scb-topp.json (topplistor + medelålder) och data/scb-alla.json (sökverktyget "Hur många heter").
import { hamta, skrivJson } from "./lib.mjs";

const BAS = "https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0001";

async function tabell(sokvag, query) {
  const d = await hamta(`${BAS}/${sokvag}`, { metod: "POST", json: true, kropp: { query, response: { format: "json" } } });
  return d.data.map((r) => ({ key: r.key, values: r.values.map((v) => (v === ".." || v === "-" ? null : Number(v))) }));
}

// Topplistor: koder "1Namn"/"2Namn" = topp 100 pojkar/män resp. flickor/kvinnor ("10…"/"20…" = topp 10, hoppas över).
async function topplista(sokvag) {
  const meta = await hamta(`${BAS}/${sokvag}`, { json: true });
  const v = meta.variables.find((x) => x.code === "Tilltalsnamn");
  const text = Object.fromEntries(v.values.map((c, i) => [c, v.valueTexts[i]]));
  const rader = await tabell(sokvag, [{ code: "Tilltalsnamn", selection: { filter: "all", values: ["*"] } }]);
  const ut = { M: {}, K: {} };
  for (const r of rader) {
    const [kod, ar] = r.key;
    const [rang, antal] = r.values;
    if (rang == null || /^[12]0/.test(kod)) continue;
    const kon = kod[0] === "1" ? "M" : "K";
    (ut[kon][ar] ??= []).push([text[kod].trim(), antal, rang]);
  }
  for (const kon of ["M", "K"]) for (const ar of Object.keys(ut[kon])) ut[kon][ar] = ut[kon][ar].sort((a, b) => a[2] - b[2] || b[1] - a[1]).map(([n, a]) => [n, a]);
  console.log(`${sokvag}: ${Object.keys(ut.M).length} år`);
  return ut;
}

const nyfodda = await topplista("BE0001D/BE0001T05AR");
const befolkning = await topplista("BE0001G/BE0001T06AR");

// Alla namn med minst 10 bärare (namn + kön kodat som "TureM").
async function namn10(sokvag, variabel, innehall, ar) {
  const rader = await tabell(sokvag, [
    { code: variabel, selection: { filter: "all", values: ["*"] } },
    { code: "ContentsCode", selection: { filter: "item", values: [innehall] } },
    { code: "Tid", selection: { filter: "item", values: [String(ar)] } },
  ]);
  const ut = {};
  for (const r of rader) {
    const x = r.values[0];
    if (!x) continue;
    const kod = r.key[0];
    (ut[kod.slice(0, -1)] ??= {})[kod.slice(-1)] = x;
  }
  console.log(`${sokvag} ${ar}: ${Object.keys(ut).length} namn`);
  return ut;
}
const t2020 = await namn10("BE0001G/BE0001TNamn10", "Tilltalsnamn", "00000001", 2020);
const t2000 = await namn10("BE0001G/BE0001TNamn10", "Tilltalsnamn", "00000001", 2000);
const f2020 = await namn10("BE0001G/BE0001FNamn10", "Fornamn", "00000002", 2020);

// Medelålder 2020 per tilltalsnamn och kön.
const metaAlder = await hamta(`${BAS}/BE0001G/BE0001T08AR`, { json: true });
const contentAlder = metaAlder.variables.find((x) => x.code === "ContentsCode").values[0];
const alder = await namn10("BE0001G/BE0001T08AR", "Tilltalsnamn", contentAlder, 2020);

// Kompakt sökdata: { namn: [kvinnor2020, män2020, förnamnK2020, förnamnM2020, tilltal2000] }
const allaNamn = [...new Set([...Object.keys(t2020), ...Object.keys(f2020)])].sort((a, b) => a.localeCompare(b, "sv"));
const sok = {};
for (const n of allaNamn) {
  const t = t2020[n] ?? {}, f = f2020[n] ?? {}, g = t2000[n] ?? {};
  sok[n] = [t.K ?? 0, t.M ?? 0, f.K ?? 0, f.M ?? 0, (g.K ?? 0) + (g.M ?? 0)];
}

const hamtad = new Date().toISOString().slice(0, 10);
skrivJson("scb-alla.json", {
  kalla: "SCB, Statistikdatabasen: BE0001TNamn10 och BE0001FNamn10, år 2000 och 2020 (CC0)",
  hamtad,
  falt: ["tilltalK2020", "tilltalM2020", "fornamnK2020", "fornamnM2020", "tilltal2000"],
  namn: sok,
});
skrivJson("scb-topp.json", {
  kalla: "SCB, Statistikdatabasen: BE0001T05AR (nyfödda 1998–2022), BE0001T06AR (folkbokförda 1999–2021), BE0001T08AR (medelålder 2020), BE0001TNamn10 (CC0)",
  hamtad,
  nyfodda,
  befolkning,
  // Medelålder bara för namn med minst 100 bärare 2020 (stabilare värden, mindre fil).
  medelalder2020: Object.fromEntries(Object.entries(alder)
    .map(([n, a]) => [n, a, t2020[n] ?? {}])
    .filter(([, , t]) => (t.K ?? 0) + (t.M ?? 0) >= 100)
    .map(([n, a, t]) => [n, { K: a.K ?? null, M: a.M ?? null, nK: t.K ?? 0, nM: t.M ?? 0, n2000: (t2000[n]?.K ?? 0) + (t2000[n]?.M ?? 0) }])),
});
console.log("Sparade data/scb-alla.json och data/scb-topp.json");
