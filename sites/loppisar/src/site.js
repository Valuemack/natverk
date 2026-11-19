import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"loppis","plur":"loppisar","art":"en"};
export const SCHEMA_TYP = "Store";
export const TITEL_ORD = "öppettider";
export const KALLA = "Källor: välgörenhetsorganisationernas och kedjornas egna butiksuppgifter samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).";

const TYP = {"second hand":"Second hand-butik","kupan":"Kupan / Röda Korset second hand","loppis":"Loppis","återbruk":"Återbruk","second hand outlet":"Second hand-outlet","retro":"Retrobutik","antikvariat":"Antikvariat","loppmarknad":"Loppmarknad","vintage":"Vintagebutik","secondhand-varuhus":"Second hand-varuhus"};
export const KAT = laddaKatalog("data/butiker.json", {
  forbered: (e) => ({
    ...e,
    typ: TYP[e.typ] ?? e.typ,
    listaRad: [TYP[e.typ] ?? e.typ, e.valgorenhet && "Välgörenhet", (e.sortiment ?? []).slice(0, 4).join(", ")].filter(Boolean).join(" · "),
    fakta: [
      e.valgorenhet && { namn: "Välgörenhet", varde: `Ja – överskottet går till ${e.organisation ?? e.kedja ?? "välgörande ändamål"}` },
      e.organisation && e.organisation !== e.kedja && !e.valgorenhet && { namn: "Organisation", varde: e.organisation },
      (e.sortiment ?? []).length > 0 && { namn: "Sortiment", varde: e.sortiment.map((x) => x[0].toUpperCase() + x.slice(1)).join(", ") },
      e.stadsdel && { namn: "Stadsdel", varde: e.stadsdel },
    ].filter(Boolean),
  }),
});

export const SITE = {
  tema: "loppis",
  tagline: "Loppis och second hand i hela Sverige",
  tjanstText: "Oberoende guide till loppisar och second hand · Uppdateras varje natt",
  kallor: ["Organisationernas butikssök (Röda Korset, Erikshjälpen, Myrorna, Stadsmissionen m.fl.)","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Loppisar",
  visningsnamn: "loppisar.nu",
  url: "https://loppisar.nu",
  beskrivning: "Alla loppisar, second hand-butiker och Kupan i Sverige med adress och öppettider – hitta loppis nära dig. Uppdateras varje natt.",
  organisation: "loppisar.nu",
  farg: "#9a4b14",
  meny: [{"namn":"Välgörenhet","href":"/valgorenhet/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om loppisar.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: välgörenhetsorganisationernas och kedjornas egna butiksuppgifter samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).",
  natverk: [],
};
