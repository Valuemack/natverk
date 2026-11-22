// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT, arGratis, krTim, TYP } from "./site.js";
import { URVAL } from "./urval.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const ladd = (e) => (e.extra?.laddplatser ?? 0) > 0;
export const VERKTYG = {
  rubrik: "Hitta parkering – gratis, i garage eller med laddning",
  oppetNu: true,
  filter: [
    { id: "gratis", namn: "Gratis", test: arGratis },
    { id: "hus", namn: "Parkeringshus/garage", test: URVAL.parkeringshus.filter },
    { id: "pendel", namn: "Pendlarparkering", test: URVAL.pendlarparkering.filter },
    { id: "ladd", namn: "Laddplatser", test: ladd },
    { id: "rh", namn: "Platser för rörelsehindrade", test: (e) => (e.extra?.handikapplatser ?? 0) > 0 },
  ],
  rad: (e) => [TYP[e.typ] ?? null, e.extra?.taxa_per_timme != null ? krTim(e.extra.taxa_per_timme) : arGratis(e) ? "gratis" : null].filter(Boolean).join(" · ") || null,
  siffror: [
    { varde: t(E.length), text: "parkeringar" },
    { varde: t(antal(arGratis)), text: "är avgiftsfria", href: "/gratis-parkering/" },
    { varde: t(antal(URVAL.parkeringshus.filter)), text: "parkeringshus och garage", href: "/parkeringshus/" },
    { varde: t(antal(URVAL.pendlarparkering.filter)), text: "pendlarparkeringar", href: "/pendlarparkering/" },
    { varde: t(antal(ladd)), text: "har laddplatser", href: "/laddning/" },
  ],
};
