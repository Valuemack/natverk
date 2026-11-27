// Prisdata för bensinstationer.nu. Flyttad hit från dagensbensinpris.se vid sammanslagningen 2026-11-27.
// Källor: kedjornas listpriser (dagligen), EU-kommissionens Weekly Oil Bulletin (veckovis sedan 2005)
// och sajtens eget stationsregister (KAT i site.js).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MANADER } from "@natverk/core/datum.js";
import { slug, rakna } from "@natverk/core/katalog.js";
import { KAT, IDAG, UPPDATERAD } from "./site.js";

export { SITE, UPPDATERAD, IDAG } from "./site.js";
export const AR = IDAG.getUTCFullYear();

const las = (f) => JSON.parse(readFileSync(resolve(process.cwd(), f), "utf8"));

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

// ---------- Drivmedel med pris ----------
/** nyckel i listpriserna, sidans adress (en sida per sökintention), namn, enhet, kolumn i EU-serien (null = finns inte där). */
export const DRIVMEDEL = [
  { nyckel: "bensin95", href: "/bensinpris/", namn: "Bensin 95", liten: "bensin 95", kort: "95", enhet: "kr/l", eu: "b95" },
  { nyckel: "bensin98", href: "/drivmedel/bensin-98/", namn: "Bensin 98", liten: "bensin 98", kort: "98", enhet: "kr/l", eu: null },
  { nyckel: "diesel", href: "/dieselpris/", namn: "Diesel", liten: "diesel", kort: "diesel", enhet: "kr/l", eu: "diesel" },
  { nyckel: "e85", href: "/drivmedel/e85/", namn: "Etanol E85", liten: "etanol E85", kort: "E85", enhet: "kr/l", eu: null },
  { nyckel: "hvo100", href: "/drivmedel/hvo100/", namn: "HVO100", liten: "HVO100", kort: "HVO100", enhet: "kr/l", eu: null },
  { nyckel: "biogas", href: "/drivmedel/fordonsgas/", namn: "Fordonsgas", liten: "fordonsgas", kort: "fordonsgas", enhet: "kr/kg", eu: null },
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
/** Lägsta listpris bland de angivna kedjorna: { kedjor: [...], pris } eller null. */
export function billigastBland(kedjor, nyckel) {
  const p = kedjor.map((c) => ({ c, p: kedjePris(c, nyckel) })).filter((x) => x.p != null);
  if (!p.length) return null;
  const min = Math.min(...p.map((x) => x.p));
  return { kedjor: p.filter((x) => x.p === min).map((x) => x.c), pris: min };
}

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

// ---------- Stationer (sajtens eget register) ----------
/** Förenklad vy av stationerna för prissidorna och guiderna. typ: "obemannad" | "bemannad" | "truckstation" | null. */
export const STATIONER = KAT.enheter.map((e) => ({
  namn: e.namn, kedja: e.kedja, typ: e.typRa, ort: e.ort, kommun: e.kommun, lan: e.lan, adress: e.gatuadress, lat: e.lat, lon: e.lon,
  href: e.href, drivmedel: e.extra?.drivmedel ?? {}, tjanster: e.extra?.tjanster ?? {},
  dygnet: e.extra?.obemannad_dygnet_runt === true || e.extra?.tankning_dygnet_runt === true || e.typRa === "obemannad",
}));
/** Kommuner med stationer (samma objekt som kommunsidorna). */
export const KOMMUNER = KAT.kommuner.map((k) => ({ namn: k.namn, slug: k.slug, href: k.href, stationer: STATIONER.filter((s) => s.kommun === k.namn) }));
export const BENSINSTATIONER_URL = "";

/** Kedjor med egen sida (minst fem stationer), samma regel som /kedja/. */
export const KEDJOR = rakna(KAT.enheter, (e) => e.kedja).filter(([k, n]) => k && n >= 5)
  .map(([namn, n]) => ({ namn, slug: slug(namn), href: `/kedja/${slug(namn)}/`, antal: n, listpris: LISTKEDJOR.includes(namn) }));
export const kedjaHref = (namn) => KEDJOR.find((k) => k.namn === namn)?.href ?? null;
