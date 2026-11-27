// Kvalitetsgrind för stationssidor (beslut 2026-11-27, se BYGGLOGG.md).
// En station får en egen sida bara om sidan har verklig, unik information som inte redan står på kommunsidan:
//   1. riktiga öppettider: bemannade tider eller butikstider (inte bara "pumpar dygnet runt", som är lika för alla automater), ELLER
//   2. gatuadress + minst två av: stationens eget telefonnummer (inte kedjans kundtjänst),
//      en egen stationssida hos kedjan (en URL som bara den stationen har) och minst tre tjänster/extra drivmedel.
// Övriga stationer listas som rader på kommunsidan (med ankare), och deras gamla URL 301-omdirigeras dit.
import { harOppettider, veckoSammanfattning } from "@natverk/core/katalog.js";

export const TJANSTER_GRIND = ["butik", "biltvatt", "toalett", "truckdiesel", "lastbilsparkering", "luft_vatten", "dusch", "mat", "verkstad"];
export const DRIVMEDEL_EXTRA = ["e85", "hvo100", "biogas", "el", "adblue", "lpg", "lng", "vatgas", "b100", "biodiesel", "alkylat"];

const dygnetRunt = (t) => veckoSammanfattning(t) === "mån–sön dygnet runt";
export const riktigaTider = (e) => (harOppettider(e) && !dygnetRunt(e.oppettider))
  || (!!e.extra?.oppettider_butik && !!veckoSammanfattning(e.extra.oppettider_butik) && !dygnetRunt(e.extra.oppettider_butik));
export const antalTjanster = (e) => TJANSTER_GRIND.filter((k) => e.extra?.tjanster?.[k] === true).length
  + DRIVMEDEL_EXTRA.filter((k) => e.extra?.drivmedel?.[k] === true).length;

/** webbAntal: Map(url → antal stationer med samma url), för att skilja en egen stationssida från kedjans startsida. */
export function harEgenSida(e, webbAntal) {
  if (riktigaTider(e)) return true;
  if (!e.gatuadress) return false;
  const egenTelefon = !!e.telefon;
  const egenWebb = !!e.webb && webbAntal.get(e.webb) === 1;
  return egenTelefon + egenWebb + (antalTjanster(e) >= 3) >= 2;
}
