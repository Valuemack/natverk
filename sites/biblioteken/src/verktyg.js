// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const mer = (e) => e.extra?.meroppet === true;
export const VERKTYG = {
  rubrik: "Hitta ett bibliotek som har öppet",
  oppetNu: true,
  filter: [
    { id: "sondag", namn: "Söndagsöppet", test: (e) => oppetHelg(e, "sun") === true },
    { id: "lordag", namn: "Lördagsöppet", test: (e) => oppetHelg(e, "sat") === true },
    { id: "kvall", namn: "Öppet efter 20", test: sentOppet },
    { id: "meroppet", namn: "Meröppet", test: mer },
  ],
  rad: (e) => (mer(e) ? "Meröppet – lånekort och pinkod utanför bemannad tid" : null),
  siffror: [
    { varde: t(E.length), text: "folk- och skolbibliotek" },
    { varde: t(antal((e) => oppetHelg(e, "sun") === true)), text: "har söndagsöppet" },
    { varde: t(antal(mer)), text: "är meröppna" },
    { varde: t(invanarePer(FOLK_SVERIGE, E.length)), text: "invånare per bibliotek" },
  ],
};
