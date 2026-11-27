// Gemensamma uträkningar för kommun-, läns- och kedjesidorna: vad varje station har, kedjornas listpris
// och sammanfattningar per område. Allt räknas ur stationsregistret och kedjornas listpriser – inget skrivs för hand.
import { veckoSammanfattning, avstandKm, rakna, grannkommuner } from "@natverk/core/katalog.js";
import { KAT, listprisFor } from "./site.js";
import { idagPris, LISTKEDJOR, kedjePris } from "./pris.js";

export const dygnetRunt = (e) => e.extra?.obemannad_dygnet_runt === true || e.extra?.tankning_dygnet_runt === true
  || veckoSammanfattning(e.oppettider) === "mån–sön dygnet runt" || veckoSammanfattning(e.extra?.oppettider_pumpar) === "mån–sön dygnet runt";
const dm = (k) => (e) => e.extra?.drivmedel?.[k] === true;
const tj = (k) => (e) => e.extra?.tjanster?.[k] === true;

/** Det besökaren letar efter på en kommunsida. id används som ankare, nyckel för länk till drivmedelssidan. */
export const FUNKTIONER = [
  { id: "dygnet-runt", namn: "Tankning dygnet runt", kort: "dygnet runt", test: dygnetRunt },
  { id: "e85", namn: "E85 (etanol)", kort: "E85", test: dm("e85"), href: "/drivmedel/e85/" },
  { id: "hvo100", namn: "HVO100", kort: "HVO100", test: dm("hvo100"), href: "/drivmedel/hvo100/" },
  { id: "fordonsgas", namn: "Fordonsgas", kort: "fordonsgas", test: dm("biogas"), href: "/drivmedel/fordonsgas/" },
  { id: "adblue", namn: "AdBlue", kort: "AdBlue", test: (e) => dm("adblue")(e) || tj("adblue")(e), href: "/drivmedel/adblue/" },
  { id: "laddning", namn: "Laddning för elbil", kort: "laddning", test: (e) => dm("el")(e) || tj("laddning")(e), href: "/drivmedel/laddning/" },
  { id: "lastbil", namn: "Lastbilsdiesel och truckstation", kort: "lastbilsdiesel", test: (e) => tj("truckdiesel")(e) || e.typRa === "truckstation", href: "/guider/truckdiesel-lastbil/" },
  { id: "biltvatt", namn: "Biltvätt", kort: "biltvätt", test: tj("biltvatt") },
  { id: "butik", namn: "Butik", kort: "butik", test: tj("butik") },
  { id: "toalett", namn: "Toalett", kort: "toalett", test: tj("toalett") },
  { id: "luft", namn: "Luft och vatten", kort: "luft", test: tj("luft_vatten") },
];
export const funktion = (id) => FUNKTIONER.find((f) => f.id === id);

const TJANST_NAMN = { butik: "butik", mat: "mat", kaffe_dryck: "kaffe", toalett: "toalett", biltvatt: "biltvätt", dammsugare: "dammsugare",
  luft_vatten: "luft och vatten", gasol: "gasol", slaputhyrning: "släpvagnsuthyrning", biluthyrning: "biluthyrning", postombud: "postombud",
  verkstad: "verkstad", truckdiesel: "lastbilsdiesel", lastbilsparkering: "lastbilsparkering", dusch: "dusch", receptfria_lakemedel: "receptfria läkemedel" };
export const tjansterText = (e) => Object.entries(TJANST_NAMN).filter(([k]) => e.extra?.tjanster?.[k] === true).map(([, v]) => v);
const DM_NAMN = [["bensin95", "95"], ["bensin98", "98"], ["diesel", "diesel"], ["e85", "E85"], ["hvo100", "HVO100"], ["biogas", "fordonsgas"], ["el", "laddning"], ["adblue", "AdBlue"], ["lpg", "LPG"], ["lng", "LNG"], ["vatgas", "vätgas"], ["alkylat", "alkylat"]];
export const drivmedelText = (e) => DM_NAMN.filter(([k]) => e.extra?.drivmedel?.[k] === true).map(([, v]) => v);
export const typText = (e) => (e.typRa === "obemannad" ? "obemannad" : e.typRa === "bemannad" ? "bemannad" : e.typRa === "truckstation" ? "truckstation" : null);

/** Kedjans listpris för en station (bara kedjor som publicerar listpris). */
export const stationsPris = (e, nyckel) => listprisFor(e.kedja)?.priser?.[nyckel]?.pris ?? null;

/** Sammanfattning för en lista stationer (kommun, län eller kedja). */
export function sammanfatta(enheter) {
  const kedjor = rakna(enheter, (e) => e.kedja ?? "Fristående och övriga");
  const medListpris = [...new Set(enheter.map((e) => e.kedja).filter((k) => LISTKEDJOR.includes(k)))];
  const billigast = (nyckel) => {
    const p = medListpris.map((c) => ({ c, p: kedjePris(c, nyckel) })).filter((x) => x.p != null).sort((a, b) => a.p - b.p);
    return p.length ? { kedjor: p.filter((x) => x.p === p[0].p).map((x) => x.c), pris: p[0].p, snitt: idagPris(nyckel), alla: p } : null;
  };
  const per = Object.fromEntries(FUNKTIONER.map((f) => [f.id, enheter.filter(f.test)]));
  return {
    n: enheter.length, kedjor, medListpris, billigast,
    per, obemannade: enheter.filter((e) => e.typRa === "obemannad"), egnaSidor: enheter.filter((e) => e.egenSida),
  };
}

/** Närmaste station med en funktion räknat från en punkt, utanför en viss kommun. */
export function narmastMed(punkt, test, utomKommun, maxKm = 150) {
  if (punkt.lat == null) return null;
  let bast = null;
  for (const e of KAT.enheter) {
    if (e.kommun === utomKommun || e.lat == null || !test(e)) continue;
    const km = avstandKm(punkt, e);
    if (km <= maxKm && (!bast || km < bast.km)) bast = { enhet: e, km };
  }
  return bast;
}

export { grannkommuner };
