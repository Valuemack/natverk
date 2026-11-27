// Hjälpfunktioner för butiksdata som kommun-, läns- och startsidan delar.
import { DAGAR, tolkaIntervall, oppetHelg, rakna } from "@natverk/core/katalog.js";
import { riktigaTider } from "../grind.js";
import { orgNyckel } from "./organisationer.js";

export const KALLNAMN = {
  osm: "OpenStreetMap", rodakorset: "Röda Korsets butikssök", erikshjalpen: "Erikshjälpens butikslista", myrorna: "Myrornas butikslista",
  pmu: "PMU:s butikslista", stadsmissionen: "Stadsmissionens webbplats", helamanniskan: "Hela Människans butikslista",
  humanbridge: "Lindras butikslista", emmaus: "Emmaus-föreningarnas webbplatser",
};

/** Huvudkategori för en butik. Bygger bara på uppgifter vi har: välgörenhet enligt organisationen, annars butikstypen i källan. */
export function kategori(e) {
  if (e.valgorenhet) return "Välgörenhet";
  if (/antikvariat/i.test(e.typ)) return "Antikvariat";
  if (/vintage|retro/i.test(e.typ)) return "Vintage och retro";
  if (/loppis|loppmarknad/i.test(e.typ)) return "Loppis";
  if (/återbruk/i.test(e.typ)) return "Återbruk";
  return "Privat second hand";
}
export const KATEGORI_TEXT = {
  "Välgörenhet": "drivs av en ideell organisation – överskottet går till välgörande ändamål",
  "Privat second hand": "privat eller fristående second hand-butik",
  Loppis: "loppis eller loppmarknad",
  Antikvariat: "antikvariat med begagnade böcker",
  "Vintage och retro": "vintage- eller retrobutik",
  "Återbruk": "återbruk – begagnat och överblivet material",
};

export const sondagsoppen = (e) => oppetHelg(e, "sun") === true;
export const lordagsoppen = (e) => oppetHelg(e, "sat") === true;

/** Öppna timmar per vecka enligt de ordinarie tiderna, eller null. */
export function timmarVecka(e) {
  if (!riktigaTider(e)) return null;
  let min = 0;
  for (const d of DAGAR) for (const [a, b] of tolkaIntervall(e.oppettider[d]) ?? []) min += b - a;
  return Math.round(min / 60);
}
/** Antal dagar per vecka med öppet. */
export const dagarOppet = (e) => (riktigaTider(e) ? DAGAR.filter((d) => (tolkaIntervall(e.oppettider[d]) ?? []).length > 0).length : 0);

/** Var öppettiderna kommer från och när de hämtades. */
export function tidKalla(e) {
  const k = e.kvalitet?.oppettider;
  const kalla = (e.kallor ?? []).find((x) => x.kalla === k) ?? e.kallor?.[0];
  return kalla ? { namn: KALLNAMN[kalla.kalla] ?? kalla.kalla, url: kalla.url, hamtad: kalla.hamtad } : null;
}

/** Organisationerna (med verifierad gåvoinfo) bland butikerna, flest först. */
export const organisationer = (enheter) => rakna(enheter, orgNyckel);

export const forstaVersal = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const listaText = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} och ${arr.at(-1)}`);
