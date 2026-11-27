// Fördjupad data per kalenderdag för datumsidorna: helgdagar och flaggdagar (beräknade enligt lag
// (1989:253) och förordning (1982:270)), FN:s internationella dagar (un.org), födda (svenska
// Wikipedia, CC BY-SA 4.0) och nedräkning till jul och nyår.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { helgdagarAr, flaggdagarAr } from "../../../rodadagar/src/lib/helgdagar.js";
import { AR, datum, plusDagar, iso, mmddAv, delMmdd, dagarMellan, nastaDatum } from "../site.js";

const las = (f, standard) => {
  const p = join(process.cwd(), "data", f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : standard;
};
const FN = las("fn-dagar.json", { dagar: {} });
const FODDA = las("wikipedia-datum.json", { dagar: {} });
export const FN_KALLA = { namn: FN.kalla, url: FN.url, hamtad: FN.hamtad };
export const FODDA_KALLA = { namn: FODDA.kalla, licens: FODDA.licens, hamtad: FODDA.hamtad };

/** FN:s internationella dagar på datumet: [{ sv, en, url }] */
export const fnDagar = (k) => FN.dagar[k] ?? [];
/** Födda på datumet enligt svenska Wikipedia: { url, fodda: [{ ar, namn, beskr }] } eller null. */
export const fodda = (k) => {
  const d = FODDA.dagar[k];
  if (!d?.fodda?.length) return null;
  // Länkmål som "Curt Lindström (tränare)" visas utan förtydligandet; avslutande punkt tas bort.
  return { ...d, fodda: d.fodda.map((x) => ({ ...x, namn: x.namn.replace(/\s*\([^)]*\)$/, ""), beskr: x.beskr.replace(/\.$/, "") })) };
};

// Riksdagsval hålls andra söndagen i september vart fjärde år (2026, 2030 …) och är allmän flaggdag.
const riksdagsval = (y) => ((y - 2026) % 4 === 0 ? plusDagar(datum(y, 9, 8), (7 - datum(y, 9, 8).getUTCDay()) % 7) : null);

/** Helgdagar, helgaftnar och flaggdagar per år för de kommande åren: Map(iso → [{ namn, typ }]) */
const HANDELSER = new Map();
for (let y = AR; y <= AR + 6; y++) {
  const lagg = (dt, namn, typ) => { const k = iso(dt); (HANDELSER.get(k) ?? HANDELSER.set(k, []).get(k)).push({ namn, typ }); };
  for (const h of helgdagarAr(y)) lagg(h.datum, h.namn, h.typ === "rod" ? "röd dag" : "helgafton");
  for (const f of flaggdagarAr(y)) lagg(f.datum, f.namn, "flaggdag");
  const val = riksdagsval(y);
  if (val) lagg(val, "Dag för val till riksdagen", "flaggdag");
}
/** Vad som infaller ett visst datum ett visst år: { rod, afton, flagg: [namn] } */
export function handelser(dt) {
  const h = HANDELSER.get(iso(dt)) ?? [];
  const namn = (t) => [...new Set(h.filter((x) => x.typ === t).map((x) => x.namn))];
  return { rod: namn("röd dag"), afton: namn("helgafton"), flagg: namn("flaggdag") };
}

/** Dag nummer på året och antal dagar kvar till julafton och nyårsafton, räknat från nästa förekomst. */
export function nedrakning(k) {
  const dt = nastaDatum(k);
  if (!dt) return null;
  const y = dt.getUTCFullYear();
  const dagNr = dagarMellan(datum(y, 1, 1), dt) + 1;
  const arsDagar = dagarMellan(datum(y, 1, 1), datum(y + 1, 1, 1));
  const jul = dagarMellan(dt, datum(y, 12, 24));
  return { dt, y, dagNr, arsDagar, kvar: arsDagar - dagNr, jul: jul >= 0 ? jul : null, nyar: dagarMellan(dt, datum(y, 12, 31)) };
}

/** Helg- och flaggdagar som bara vissa år infaller på datumet (påsk, pingst, midsommar, val …): [{ ar, namn, typ }] */
export function rorligaPa(k) {
  const { m, d } = delMmdd(k);
  const per = [];
  for (let y = AR; y <= AR + 6; y++) {
    const dt = datum(y, m, d);
    if (mmddAv(dt) === k) per.push({ y, h: HANDELSER.get(iso(dt)) ?? [] });
  }
  const varjeAr = (namn) => per.every((x) => x.h.some((h) => h.namn === namn));
  return per.flatMap((x) => x.h.filter((h) => !varjeAr(h.namn)).map((h) => ({ ar: x.y, namn: h.namn, typ: h.typ })));
}

/** Historiska händelser på datumet enligt svenska Wikipedia (avsnittet Händelser): [{ ar, text }]. */
export const historia = (k) => FODDA.dagar[k]?.handelser ?? [];
/** Inledningen till Wikipedias artikel om helgdagen, för dagar utan namn i almanackan: { titel, url, text } eller null. */
export const helgWiki = (k) => FODDA.dagar[k]?.helg ?? null;
