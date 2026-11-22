// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT, nivaer } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const har = (k) => (e) => e.extra?.[k] === true;
export const VERKTYG = {
  rubrik: "Hitta komvux och sfi nära dig",
  filter: [
    { id: "sfi", namn: "Sfi", test: har("sfi") },
    { id: "grund", namn: "Grundläggande", test: har("grundlaggande") },
    { id: "gymn", namn: "Gymnasial", test: har("gymnasial") },
    { id: "anpassad", namn: "Anpassad utbildning", test: har("anpassad") },
    { id: "kommunal", namn: "Kommunal skola", test: (e) => e.extra?.huvudmanstyp === "kommunal" },
  ],
  rad: (e) => nivaer(e).join(", ") || null,
  siffror: [],
};
