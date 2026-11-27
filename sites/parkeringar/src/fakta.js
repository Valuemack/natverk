// Uträkningar som kommun-, läns-, urvals- och parkeringssidorna delar. Allt räknas ur datan; inget hittas på.
import { rakna, avstandKm, kmText } from "@natverk/core/katalog.js";
import { arGratis, krTim, TYP, maxTid, platser } from "./site.js";
import { arPrivat } from "./grind.js";
// Parkeringar för personal, hyresgäster eller en bostadsrättsförening räknas i mittenvärdet men lyfts inte fram som "billigast".
const ICKE_PUBLIK = /(personal|anställda|hyresgäst|\bbrf\b|bostadsrättsförening)/i;
export const publik = (e) => !arPrivat(e) && !ICKE_PUBLIK.test(e.namn);

export const HUS = ["parkeringshus", "parkeringsgarage"];
export const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
export const tal = (n) => String(n).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const timprisAv = (e) => (e.extra?.taxa_per_timme > 0 ? e.extra.taxa_per_timme : null);

// Dygnspris: verifierat, annars ur taxetexten ("24 h - 100 kr", "60 kr/dag", "40 kr/dygn", "periodbiljett 24-tim").
export function dygnspris(e) {
  if (e.verifierad?.dygnspris) return e.verifierad.dygnspris;
  const t = e.extra?.taxa ?? "";
  const m = t.match(/24 ?h\s*-\s*(\d+)\s*kr/i) ?? t.match(/(\d+)\s*kr\s*\/\s*(?:dygn|dag)\b/i) ?? t.match(/(\d+)\s*kr\s*periodbiljett\s*24/i) ?? t.match(/(\d+)\s*kr\s*\/\s*till 24/i);
  const v = m ? Number(m[1]) : null;
  const tim = e.extra?.taxa_per_timme;
  // Ett dygnspris lägre än två timmar är nästan alltid en MC- eller boendetaxa – då visas det inte.
  return v > 0 && v < 1000 && !(tim > 0 && v < tim * 2) ? v : null;
}

/** Nyckeltal för en grupp parkeringar (kommun, län, hela landet). */
export function nyckeltal(alla) {
  const medPris = alla.filter(timprisAv).sort((a, b) => timprisAv(a) - timprisAv(b));
  const dygn = alla.map(dygnspris).filter(Boolean);
  const gratis = alla.filter(arGratis);
  const ladd = alla.filter((e) => e.extra?.laddplatser > 0);
  const hcp = alla.filter((e) => e.extra?.handikapplatser > 0);
  const maxtid = alla.filter((e) => e.extra?.max_tid && !/obegränsad/i.test(e.extra.max_tid));
  return {
    n: alla.length,
    medPris, dygn,
    medianTim: median(medPris.map(timprisAv)),
    medianDygn: median(dygn),
    billiga: medPris.filter(publik),
    billigast: medPris.find(publik) ?? null,
    dyrast: medPris.at(-1) ?? null,
    gratis, ladd, hcp, maxtid,
    laddPlatser: ladd.reduce((s, e) => s + e.extra.laddplatser, 0),
    hcpPlatser: hcp.reduce((s, e) => s + e.extra.handikapplatser, 0),
    platser: alla.reduce((s, e) => s + (platser(e) ?? 0), 0),
    hus: alla.filter((e) => HUS.includes(e.typ)),
    pendlar: alla.filter((e) => e.typ === "pendlarparkering"),
    operatorer: rakna(alla.filter((e) => e.kedja), (e) => e.kedja),
    // Tidsgränser grupperade: "2 timmar" → 14 st.
    tidsgranser: rakna(maxtid, (e) => maxTid(e.extra.max_tid)),
    gratisTid: rakna(maxtid.filter(arGratis), (e) => maxTid(e.extra.max_tid)),
  };
}

// Parkeringar vid station och sjukhus: bara när namnet säger det (ingen gissning utifrån läge).
const STATION = /(station|central|resecentrum|pendel|infart|tåg|järnväg)/i;
const SJUKHUS = /(sjukhus|lasarett|akut|vårdcentral|hälsocentral|universitetssjukhus|\bUS\b|NÄL|SUS)/;
export const vidStation = (alla) => alla.filter((e) => STATION.test(e.namn));
export const vidSjukhus = (alla) => alla.filter((e) => SJUKHUS.test(e.namn));

/** Kort radtext om pris: "25 kr/tim · 150 kr/dygn" eller "gratis · max 2 timmar". */
export function prisText(e) {
  const t = timprisAv(e), d = dygnspris(e);
  if (arGratis(e)) return ["gratis", e.extra?.max_tid && `max ${maxTid(e.extra.max_tid)}`].filter(Boolean).join(" · ");
  return [t && krTim(t), d && `${tal(d)} kr/dygn`].filter(Boolean).join(" · ") || null;
}

/** Närmaste parkeringar med avstånd och pris. */
export function naraMedPris(e, alla, n = 8, maxKm = 3) {
  if (e.lat == null) return [];
  return alla.filter((x) => x !== e && x.lat != null).map((x) => ({ enhet: x, km: avstandKm(e, x) }))
    .filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, n);
}
export { kmText, krTim, TYP, arGratis, maxTid, platser };

/** Prisläge mot övriga parkeringar med timpris i samma kommun: andel som är dyrare. */
export function prisLage(e, kommunEnheter) {
  const t = timprisAv(e);
  const ovr = kommunEnheter.filter((x) => x !== e && timprisAv(x));
  if (!t || ovr.length < 5) return null;
  const dyrare = ovr.filter((x) => timprisAv(x) > t).length, billigare = ovr.filter((x) => timprisAv(x) < t).length;
  return { dyrare, billigare, n: ovr.length, median: median(ovr.map(timprisAv)) };
}
