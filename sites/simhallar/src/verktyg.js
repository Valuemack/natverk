// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT, harFacilitet } from "./site.js";
import { URVAL } from "./urval.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const fac = (k) => (e) => harFacilitet(e, k);
const TYPNAMN = { badhus: "Badhus", "äventyrsbad": "Äventyrsbad", simhall: "Simhall", utomhusbad: "Utomhusbad" };
export const VERKTYG = {
  rubrik: "Hitta rätt bad – äventyrsbad, långbana eller babysim",
  oppetNu: true,
  filter: [
    { id: "aventyr", namn: "Äventyrsbad/rutschkana", test: URVAL.aventyrsbad.filter },
    { id: "50m", namn: "50-metersbassäng", test: URVAL["50-meter"].filter },
    { id: "babysim", namn: "Babysim", test: fac("babysim") },
    { id: "varm", namn: "Varmvattenbassäng", test: fac("varmbassang") },
    { id: "ute", namn: "Utomhusbassäng", test: fac("utomhusbassang") },
    { id: "relax", namn: "Bastu/relax", test: (e) => harFacilitet(e, "bastu") || harFacilitet(e, "relax") },
  ],
  rad: (e) => [TYPNAMN[e.typ], e.extra?.priser?.vuxen != null && `vuxen ${e.extra.priser.vuxen} kr`].filter(Boolean).join(" · ") || null,
  siffror: [
    { varde: t(E.length), text: "simhallar och bad" },
    { varde: t(antal(URVAL.aventyrsbad.filter)), text: "äventyrsbad och bad med rutschkana", href: "/aventyrsbad/" },
    { varde: t(antal(URVAL["50-meter"].filter)), text: "har 50-metersbassäng", href: "/50-meter/" },
    { varde: t(antal(fac("babysim"))), text: "har babysim" },
  ],
};
