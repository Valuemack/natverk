// dagensbensinpris.se: konfiguration och all data som sidorna bygger på.
// Källor: kedjornas listpriser (dagligen), EU-kommissionens Weekly Oil Bulletin (veckovis sedan 2005)
// och stationsregistret från bensinstationer.nu.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { idagStockholm, iso, MANADER } from "@natverk/core/datum.js";
import { slug, lanKortnamn } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);
export const AR = IDAG.getUTCFullYear();

const las = (f) => JSON.parse(readFileSync(resolve(process.cwd(), f), "utf8"));

export const SITE = {
  tema: "prisskylt",
  tagline: "Bensin- och dieselpriser varje dag",
  tjanstText: "Oberoende pristjänst · Uppdateras varje natt",
  kallor: ["Kedjornas publicerade listpriser", "EU-kommissionen, Weekly Oil Bulletin (CC BY 4.0)", "Stationsregister: bensinstationer.nu"],
  namn: "Dagens bensinpris",
  visningsnamn: "dagensbensinpris.se",
  url: "https://dagensbensinpris.se",
  beskrivning: "Dagens bensinpris och dieselpris i Sverige: listpriser per kedja, prishistorik sedan 2005, priser i Europa, skatterna i priset och bränslekostnad per mil.",
  organisation: "dagensbensinpris.se",
  farg: "#9a4a00",
  meny: [
    { namn: "Bensin idag", href: "/" },
    { namn: "Diesel", href: "/diesel/" },
    { namn: "Historik", href: "/historik/" },
    { namn: "Europa", href: "/europa/" },
    { namn: "Per ort", href: "/ort/" },
    { namn: "Räkna", href: "/rakna/" },
    { namn: "Guider", href: "/guider/" },
  ],
  sidfot: [
    { namn: "Om dagensbensinpris.se", href: "/om/" },
    { namn: "Källor och metod", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Priserna är kedjornas publicerade listpriser och EU-kommissionens veckogenomsnitt. Priset på en enskild station sätts lokalt och kan avvika.",
  natverk: [],
};

// ---------- Formatering ----------
const tal = (v, d = 2) => Number(v).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
export const kr = (v, d = 2) => (v == null || Number.isNaN(v) ? "–" : `${tal(v, d)} kr`);
export const pris = (v, d = 2) => (v == null || Number.isNaN(v) ? "–" : tal(v, d));
export const andring = (v, d = 2) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${tal(Math.abs(v), d)} kr`);
export const procent = (v, d = 0) => `${tal(v, d)} %`;
export const riktning = (v) => (v > 0.004 ? "upp" : v < -0.004 ? "ned" : "");
export const datumText = (s) => { const [y, m, d] = s.split("-").map(Number); return `${d} ${MANADER[m - 1]} ${y}`; };
export const manadText = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MANADER[m - 1]} ${y}`; };
const medel = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ---------- Drivmedel ----------
/** nyckel i listpriserna, sidans slug, namn, kort namn, enhet, kolumn i EU-serien (null = finns inte där). */
export const DRIVMEDEL = [
  { nyckel: "bensin95", slug: "bensin-95", namn: "Bensin 95", liten: "bensin 95", kort: "95", enhet: "kr/l", eu: "b95" },
  { nyckel: "bensin98", slug: "bensin-98", namn: "Bensin 98", liten: "bensin 98", kort: "98", enhet: "kr/l", eu: null },
  { nyckel: "diesel", slug: "diesel", namn: "Diesel", liten: "diesel", kort: "diesel", enhet: "kr/l", eu: "diesel" },
  { nyckel: "e85", slug: "e85", namn: "Etanol E85", liten: "etanol E85", kort: "E85", enhet: "kr/l", eu: null },
  { nyckel: "hvo100", slug: "hvo100", namn: "HVO100", liten: "HVO100", kort: "HVO100", enhet: "kr/l", eu: null },
  { nyckel: "biogas", slug: "fordonsgas", namn: "Fordonsgas", liten: "fordonsgas", kort: "fordonsgas", enhet: "kr/kg", eu: null },
];
export const drivmedel = (nyckel) => DRIVMEDEL.find((d) => d.nyckel === nyckel);

// ---------- Kedjornas listpriser (idag) och daglig historik ----------
export const LP = las("data/listpriser.json");
export const LP_DATUM = LP.datum;
/** Är listpriserna från idag? (Annars misslyckades nattens hämtning och vi visar senaste.) */
export const AKTUELL = LP.datum === UPPDATERAD;
export const DAGAR = (existsSync(resolve(process.cwd(), "data/dagspriser.json")) ? las("data/dagspriser.json").dagar : []).filter((d) => d.datum <= LP.datum);
export const idagPris = (nyckel) => LP.snitt?.[nyckel]?.pris ?? null;
/** Ändring mot närmast föregående dag i den dagliga historiken. */
export function dagsAndring(nyckel) {
  const f = DAGAR.filter((d) => d.datum < LP.datum && d.snitt[nyckel] != null).at(-1);
  return f ? { mot: f.datum, varde: idagPris(nyckel) - f.snitt[nyckel] } : null;
}
export const kedjePris = (kedja, nyckel) => LP.kedjor.find((c) => c.kedja === kedja)?.priser?.[nyckel]?.pris ?? null;
export const LISTKEDJOR = LP.kedjor.map((c) => c.kedja);

// ---------- EU:s veckopriser ----------
export const EU = las("data/eu.json");
const SE = EU.lander.SE.serie;
const seKurs = new Map(SE.map((r) => [r[0], r[5]])); // EUR per SEK
/** Sveriges veckopriser i kronor per liter: datum, 95, diesel, 95 utan skatt, diesel utan skatt. */
export const VECKOR = SE.filter((r) => r[1] && r[5]).map((r) => ({
  datum: r[0], b95: r[1] / r[5], diesel: r[2] ? r[2] / r[5] : null, b95utan: r[3] ? r[3] / r[5] : null, dieselutan: r[4] ? r[4] / r[5] : null,
}));
export const SENASTE_VECKA = VECKOR.at(-1);
export const FORRA_VECKAN = VECKOR.at(-2);
export const veckaForeDatum = (d) => VECKOR.filter((v) => v.datum <= d).at(-1);
export const VALUTA = { DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", SE: "SEK", BG: "BGN" };

/** Skatterna i priset den senaste veckan (moms 25 % på hela priset inklusive punktskatter). */
export function skattedelar(v = SENASTE_VECKA, typ = "b95") {
  const med = v[typ], utan = v[`${typ}utan`];
  if (!med || !utan) return null;
  const moms = med - med / 1.25;
  const punkt = med / 1.25 - utan;
  return { pris: med, produkt: utan, punkt, moms, skatt: punkt + moms, andelSkatt: (punkt + moms) / med };
}

/** Årsöversikt: medel, lägsta och högsta veckopris per år. */
export const AR_LISTA = [...new Set(VECKOR.map((v) => Number(v.datum.slice(0, 4))))].sort((a, b) => a - b);
export function arSammanfattning(ar) {
  const v = VECKOR.filter((x) => x.datum.startsWith(`${ar}-`));
  if (!v.length) return null;
  const ext = (k, f) => v.filter((x) => x[k] != null).reduce((a, b) => (f(b[k], a[k]) ? b : a));
  const sammanf = (k) => {
    const m = medel(v.map((x) => x[k]).filter((x) => x != null));
    if (m == null) return null;
    const lag = ext(k, (a, b) => a < b), hog = ext(k, (a, b) => a > b);
    return { medel: m, lag: lag[k], lagDatum: lag.datum, hog: hog[k], hogDatum: hog.datum };
  };
  const manader = [...new Set(v.map((x) => x.datum.slice(0, 7)))].map((ym) => {
    const w = v.filter((x) => x.datum.startsWith(ym));
    return { ym, b95: medel(w.map((x) => x.b95)), diesel: medel(w.map((x) => x.diesel).filter((x) => x != null)), veckor: w.length };
  });
  return { ar, veckor: v, b95: sammanf("b95"), diesel: sammanf("diesel"), manader, komplett: v.length >= 45 };
}

// ---------- Länder ----------
export const LANDER = Object.entries(EU.lander).filter(([k]) => k !== "SE").map(([kod, l]) => ({ kod, namn: l.namn, slug: slug(l.namn), serie: l.serie }));
/** Ett lands senaste veckopris i kronor (omräknat med samma veckas kurs) och i egen valuta. */
export function landPris(kod, datum = SENASTE_VECKA.datum) {
  const serie = EU.lander[kod]?.serie ?? [];
  const r = serie.filter((x) => x[0] <= datum && x[1]).at(-1);
  if (!r) return null;
  const k = seKurs.get(r[0]);
  const valuta = r[5] && Math.abs(r[5] - 1) > 1e-9 ? VALUTA[kod] ?? null : "EUR";
  return {
    datum: r[0], b95: r[1] / k, diesel: r[2] ? r[2] / k : null, b95utan: r[3] ? r[3] / k : null, dieselutan: r[4] ? r[4] / k : null,
    b95eur: r[1], dieseleur: r[2], valuta, b95lokal: valuta === "EUR" ? r[1] : r[1] / r[5], diesellokal: r[2] ? (valuta === "EUR" ? r[2] : r[2] / r[5]) : null,
  };
}
/** Ett lands veckoserie i kronor per liter (för diagram). */
export const landSerie = (kod) => (EU.lander[kod]?.serie ?? []).filter((r) => r[1] && seKurs.get(r[0])).map((r) => ({ datum: r[0], b95: r[1] / seKurs.get(r[0]), diesel: r[2] ? r[2] / seKurs.get(r[0]) : null }));

// ---------- Stationer (från bensinstationer.nu) ----------
const KEDJENAMN = { "fordonsgas sverige": "Fordonsgas", fordonsgas: "Fordonsgas", "oljeshejkerna johnsson": "Oljeshejkerna" };
const kedjaNamn = (k) => (k ? KEDJENAMN[k.toLowerCase().replace(/\s+ab$/, "")] ?? k.replace(/\s+AB$/, "") : null);
// Vissa kedjor skriver i versaler ("GAMLESTADSVÄGEN"); ord på minst fyra versaler görs om (samma regel som bensinstationer.nu).
const versaler = (s) => (s ? s.replace(/(^|[\s,(\/-])([A-ZÅÄÖÉ]{4,})(?=[\s.,)\/-]|$)/g, (m, fore, w) => fore + w[0] + w.slice(1).toLowerCase()) : s);
export const STATIONER = las("../bensinstationer/data/stationer.json").map((e) => ({
  namn: versaler(e.namn), kedja: kedjaNamn(e.kedja), typ: e.typ, ort: e.ort, kommun: e.kommun, lan: e.lan, adress: versaler(e.gatuadress),
  drivmedel: e.extra?.drivmedel ?? {}, dygnet: e.extra?.obemannad_dygnet_runt === true || e.typ === "obemannad",
}));
// Samma slug-regel som bensinstationer.nu (core/katalog.js): krockar som Håbo/Habo får länet som suffix,
// i den ordning kommunerna dyker upp i datan – så att länkarna dit blir rätt.
const kommunSlug = new Map();
{
  const anvand = new Set();
  for (const s of STATIONER) {
    if (!s.kommun || kommunSlug.has(s.kommun)) continue;
    let ks = slug(s.kommun);
    if (anvand.has(ks)) ks = `${ks}-${slug(lanKortnamn(s.lan) ?? "")}`;
    anvand.add(ks);
    kommunSlug.set(s.kommun, ks);
  }
}
export const KOMMUNER = [...kommunSlug.keys()].sort((a, b) => a.localeCompare(b, "sv"))
  .map((namn) => ({ namn, slug: kommunSlug.get(namn), stationer: STATIONER.filter((s) => s.kommun === namn) }))
  .filter((k) => k.stationer.length >= 2);
export const BENSINSTATIONER_URL = "https://bensinstationer.nu";

/** Kedjor med egen sida: de som publicerar listpriser + de största utan listpris. */
export const KEDJOR = (() => {
  const antal = new Map();
  for (const s of STATIONER) if (s.kedja) antal.set(s.kedja, (antal.get(s.kedja) ?? 0) + 1);
  return [...antal.entries()].filter(([k, n]) => LISTKEDJOR.includes(k) || n >= 50).sort((a, b) => b[1] - a[1])
    .map(([namn, n]) => ({ namn, slug: slug(namn), antal: n, listpris: LISTKEDJOR.includes(namn) }));
})();
