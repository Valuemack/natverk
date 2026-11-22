// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const senasteKlass = (e) => [e.extra?.klassificering, ...(e.extra?.klassificeringar ?? [])].find((k) => k && !/pågår|ej klass/i.test(k.klass));
const utmarkt = (e) => /utmärkt/i.test(senasteKlass(e)?.klass ?? "");
const eu = (e) => !!e.extra?.eu_badplats;
const vt = (v) => (e) => e.extra?.vattentyp === v;
const VATTEN = { Hav: "Havsbad", "Sjö": "Sjöbad", Vattendrag: "Bad i vattendrag", Delta: "Bad i delta" };
export const VERKTYG = {
  rubrik: "Hitta en badplats med bra vatten",
  filter: [
    { id: "utmarkt", namn: "Utmärkt vattenkvalitet", test: utmarkt },
    { id: "eu", namn: "EU-badplats (provtas)", test: eu },
    { id: "hav", namn: "Havsbad", test: vt("Hav") },
    { id: "sjo", namn: "Sjöbad", test: vt("Sjö") },
  ],
  rad: (e) => [VATTEN[e.extra?.vattentyp], senasteKlass(e)?.klass].filter(Boolean).join(" · ") || null,
  siffror: [
    { varde: t(E.length), text: "badplatser" },
    { varde: t(antal(eu)), text: "EU-badplatser med provtagning" },
    { varde: t(antal(utmarkt)), text: "har utmärkt vattenkvalitet", href: "/basta-vattenkvalitet/" },
    { varde: t(antal(vt("Hav"))), text: "havsbad" },
    { varde: t(antal(vt("Sjö"))), text: "sjöbad" },
  ],
};
