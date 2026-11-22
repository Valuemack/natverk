// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const valg = (e) => e.valgorenhet === true;
export const VERKTYG = {
  rubrik: "Hitta en loppis som har öppet",
  oppetNu: true,
  filter: [
    { id: "valg", namn: "Välgörenhet", test: valg },
    { id: "lordag", namn: "Lördagsöppet", test: (e) => oppetHelg(e, "sat") === true },
    { id: "sondag", namn: "Söndagsöppet", test: (e) => oppetHelg(e, "sun") === true },
    { id: "mobler", namn: "Möbler", test: (e) => (e.sortiment ?? []).includes("möbler") },
  ],
  rad: (e) => [e.kedja ?? e.organisation, valg(e) && "välgörenhet"].filter(Boolean).join(" · ") || null,
  siffror: [
    { varde: t(E.length), text: "loppisar och second hand" },
    { varde: t(antal(valg)), text: "drivs för välgörenhet", href: "/valgorenhet/" },
    { varde: t(antal((e) => oppetHelg(e, "sat") === true)), text: "har lördagsöppet" },
    { varde: t(antal((e) => oppetHelg(e, "sun") === true)), text: "har söndagsöppet" },
  ],
};
