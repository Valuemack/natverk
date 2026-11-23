// Små textbyggare som återanvänds på flera sidor.
import { lang, kort, dagarMellan, isoVecka, veckodag } from "@natverk/core/datum.js";

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

/** "lördag 20 mars – måndag 29 mars" (år läggs till om perioden korsar ett årsskifte). */
export function period(fran, till) {
  const tvaAr = fran.getUTCFullYear() !== till.getUTCFullYear();
  const f = (d) => `${veckodag(d)} ${kort(d)}${tvaAr ? " " + d.getUTCFullYear() : ""}`;
  return `${f(fran)} – ${f(till)}`;
}

/** Datumlista komprimerad till intervall: "22–25 mars", "28–30 december och 4–5 januari". */
export function datumIntervall(lista) {
  const grupper = [];
  for (const d of lista) {
    const g = grupper.at(-1);
    if (g && dagarMellan(g.at(-1), d) === 1) g.push(d); else grupper.push([d]);
  }
  return lista_(grupper.map((g) => {
    const a = g[0], b = g.at(-1);
    if (g.length === 1) return kort(a);
    return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${kort(b)}` : `${kort(a)}–${kort(b)}`;
  }));
}
const lista_ = (arr) => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " och " + arr.at(-1);

/** "Ta 4 semesterdagar (22–25 mars) och bli ledig 10 dagar i rad, lördag 20 mars – måndag 29 mars." */
export const tipsText = (t) =>
  `Ta ${t.semesterdagar === 1 ? "1 semesterdag" : `${t.semesterdagar} semesterdagar`} (${datumIntervall(t.ta)}) och bli ledig ${t.dagar} dagar i rad, ${period(t.fran, t.till)}.`;

/** Helgdagsnamn mitt i en mening: "långfredagen", men "Sveriges nationaldag" och "Kristi himmelsfärdsdag". */
export const smaNamn = (namn) => (/^(Sveriges|Kristi)/.test(namn) ? namn : namn.charAt(0).toLowerCase() + namn.slice(1));

/** "Nyår 2026–2027 och trettondedag jul" */
export const gruppLista = (namn) => { const s = lista(namn.map(smaNamn)); return s.charAt(0).toUpperCase() + s.slice(1); };
