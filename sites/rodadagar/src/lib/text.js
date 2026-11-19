// Små textbyggare som återanvänds på flera sidor.
import { lang, kort, dagarMellan, isoVecka } from "@natverk/core/datum.js";

/** "påsk", "midsommar", men "Kristi himmelsfärd" behåller versal. */
export const fras = (h) => (h.kort.startsWith("Kristi") ? h.kort : h.kort.charAt(0).toLowerCase() + h.kort.slice(1));

export function omDagar(fran, till) {
  const n = dagarMellan(fran, till);
  if (n === 0) return "idag";
  if (n === 1) return "imorgon";
  return `om ${n} dagar`;
}

export const datumMedVecka = (d) => `${lang(d)} (vecka ${isoVecka(d).vecka})`;

export const lista = (arr) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " och " + arr.at(-1);

export const kortMedAr = (d) => `${kort(d)} ${d.getUTCFullYear()}`;

/** "1 klämdag" / "3 klämdagar" */
export const st = (n, sing, plur) => `${n} ${n === 1 ? sing : plur}`;
