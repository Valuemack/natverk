// Startsidans sökverktyg: sajtens egna filter, extra rad i träfflistan och nyckeltal.
// Testerna körs vid bygget och skrivs som id:n i /narmaste.json (se @natverk/core/katalog/Sokverktyg.astro).
import { oppetHelg, sentOppet, invanarePer, talText, FOLK_SVERIGE } from "@natverk/core/katalog.js";
import { KAT, DRIVMEDEL, harDrivmedel } from "./site.js";
const E = KAT.enheter;
const antal = (f) => E.filter(f).length;
const t = (n) => talText(n);
const dm = (k) => (e) => harDrivmedel(e, k);
const dygn = (e) => e.extra?.obemannad_dygnet_runt === true || e.extra?.tankning_dygnet_runt === true;
export const VERKTYG = {
  rubrik: "Hitta rätt drivmedel nära dig",
  oppetNu: true,
  filter: [
    { id: "dygn", namn: "Tanka dygnet runt", test: dygn },
    { id: "hvo", namn: "HVO100", test: dm("hvo100") },
    { id: "e85", namn: "E85", test: dm("e85") },
    { id: "gas", namn: "Fordonsgas", test: dm("biogas") },
    { id: "el", namn: "Laddning", test: dm("el") },
    { id: "adblue", namn: "AdBlue", test: dm("adblue") },
  ],
  rad: (e) => DRIVMEDEL.filter(([k]) => harDrivmedel(e, k)).map(([, kn]) => kn).join(", ") || null,
  siffror: [
    { varde: t(E.length), text: "bensinstationer" },
    { varde: t(antal(dm("hvo100"))), text: "säljer HVO100", href: "/drivmedel/hvo100/" },
    { varde: t(antal(dm("e85"))), text: "säljer E85", href: "/drivmedel/e85/" },
    { varde: t(antal(dm("biogas"))), text: "har fordonsgas", href: "/drivmedel/fordonsgas/" },
    { varde: t(antal(dygn)), text: "går att tanka dygnet runt" },
  ],
};
