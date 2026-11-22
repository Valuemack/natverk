// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const inr = (re) => (e) => re.test(e.extra?.inriktning ?? "");
const enskild = (e) => e.extra?.huvudmanstyp === "enskild";
export const VERKTYG = {
  rubrik: "Hitta förskolor nära dig – kommunala och fristående",
  filter: [
    { id: "kommunal", namn: "Kommunal", test: (e) => e.extra?.huvudmanstyp === "kommunal" },
    { id: "fristaende", namn: "Fristående", test: enskild },
    { id: "montessori", namn: "Montessori", test: inr(/montessori/i) },
    { id: "kooperativ", namn: "Kooperativ", test: inr(/kooperativ/i) },
    { id: "natur", namn: "Ur och skur / natur", test: inr(/ur och skur|natur|friluft/i) },
    { id: "waldorf", namn: "Waldorf", test: inr(/waldorf/i) },
  ],
  rad: (e) => [enskild(e) ? "Fristående" : "Kommunal", e.extra?.inriktning].filter(Boolean).join(" · "),
  siffror: [
    { varde: t(E.length), text: "förskolor" },
    { varde: `${Math.round(100 * antal(enskild) / E.length)} %`, text: "är fristående", href: "/jamfor/" },
    { varde: t(antal(inr(/montessori/i))), text: "Montessoriförskolor" },
    { varde: t(antal(inr(/kooperativ/i))), text: "föräldra- och personalkooperativ" },
  ],
};
