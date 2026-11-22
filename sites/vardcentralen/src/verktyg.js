// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const dropin = (e) => e.extra?.dropin === true;
const akut = (e) => e.extra?.narakut === true || e.extra?.jourmottagning === true;
const privat = (e) => e.extra?.huvudman === "privat";
export const VERKTYG = {
  rubrik: "Hitta en vårdcentral – drop-in, närakut och öppettider",
  oppetNu: true,
  filter: [
    { id: "dropin", namn: "Drop-in", test: dropin },
    { id: "akut", namn: "Närakut eller jour", test: akut },
    { id: "region", namn: "Regionens", test: (e) => e.extra?.huvudman === "region" },
    { id: "privat", namn: "Privat", test: privat },
    { id: "helg", namn: "Helgöppet", test: (e) => oppetHelg(e, "sat") === true || oppetHelg(e, "sun") === true },
  ],
  rad: (e) => [e.extra?.huvudman === "privat" ? "Privat vårdcentral" : e.extra?.huvudman === "region" ? "Regionens vårdcentral" : null, dropin(e) && "drop-in"].filter(Boolean).join(" · ") || null,
  siffror: [
    { varde: t(E.length), text: "vårdcentraler" },
    { varde: t(antal(dropin)), text: "har drop-in", href: "/drop-in/" },
    { varde: t(antal(akut)), text: "närakuter och jourmottagningar" },
    { varde: `${Math.round(100 * antal(privat) / E.length)} %`, text: "drivs privat" },
  ],
};
