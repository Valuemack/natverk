// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
export const VERKTYG = {
  rubrik: "Hitta ett apotek som har öppet",
  oppetNu: true,
  filter: [
    { id: "sondag", namn: "Söndagsöppet", test: (e) => oppetHelg(e, "sun") === true },
    { id: "lordag", namn: "Lördagsöppet", test: (e) => oppetHelg(e, "sat") === true },
    { id: "kvall", namn: "Öppet efter 20", test: sentOppet },
  ],
  rad: (e) => e.kedja ?? null,
  siffror: [
    { varde: t(E.length), text: "apotek i registret" },
    { varde: t(antal((e) => oppetHelg(e, "sun") === true)), text: "har söndagsöppet" },
    { varde: t(antal(sentOppet)), text: "har öppet efter 20", href: "/jourapotek/" },
    { varde: t(invanarePer(FOLK_SVERIGE, E.length)), text: "invånare per apotek" },
  ],
};
