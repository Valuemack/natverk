import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"apotek","plur":"apotek","art":"ett"};
export const SCHEMA_TYP = "Pharmacy";
export const TITEL_ORD = "öppettider";
export const KALLA = "Källor: Läkemedelsverkets register över öppenvårdsapotek och OpenStreetMap (© OpenStreetMaps bidragsgivare, ODbL).";

const AR_TEXT = (d) => d && `${d.slice(0, 4)}`;
export const KAT = laddaKatalog("data/apotek.json", {
  // Bara apotek som tar emot kunder på plats (inte e-handel, dos eller sjukhusenheter).
  filter: (e) => e.typ === "butik" || e.typ === "okänd",
  forbered: (e) => ({
    ...e,
    typ: "öppenvårdsapotek",
    fakta: [
      e.tillstandshavare && !(e.kedja && e.tillstandshavare.startsWith(e.kedja)) && { namn: "Tillståndshavare", varde: e.tillstandshavare },
      e.tillstand_fran && { namn: "Tillstånd sedan", varde: AR_TEXT(e.tillstand_fran) },
    ].filter(Boolean),
  }),
});

export const SITE = {
  tema: "apotek",
  tagline: "Öppettider för Sveriges apotek",
  tjanstText: "Oberoende apoteksguide · Uppgifter från Läkemedelsverkets register och apotekskedjorna",
  kallor: ["Läkemedelsverket (register över öppenvårdsapotek)","Apotekskedjornas apotekssök","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Apoteken",
  visningsnamn: "apoteken.nu",
  url: "https://apoteken.nu",
  beskrivning: "Alla apotek i Sverige med adress, telefon och öppettider – se vilka som har öppet nu, på kvällen och på söndagar. Uppdateras varje natt.",
  organisation: "apoteken.nu",
  farg: "#0b7a4b",
  meny: [{"namn":"Jourapotek","href":"/jourapotek/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om apoteken.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: Läkemedelsverkets register över öppenvårdsapotek och OpenStreetMap (© OpenStreetMaps bidragsgivare, ODbL).",
  natverk: [],
};
