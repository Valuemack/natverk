// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT, UTRUSTNING, utrustning } from "./site.js";
import { URVAL } from "./urval.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const KORT = { temalekplatser: "Tema/natur", "lekplatser-med-linbana": "Linbana", "lekplatser-med-vattenlek": "Vattenlek", "lekplatser-med-studsmatta": "Studsmatta", "lekplatser-med-kompisgunga": "Kompisgunga", "tillgangliga-lekplatser": "Tillgänglig" };
export const VERKTYG = {
  rubrik: "Hitta en lekplats med det ni gillar",
  filter: Object.entries(URVAL).map(([id, u]) => ({ id, namn: KORT[id] ?? u.namn, test: u.filter })),
  rad: (e) => utrustning(e).slice(0, 5).map((u) => UTRUSTNING[u].toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase()) || null,
  siffror: [],
};
