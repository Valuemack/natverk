import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog, veckoSammanfattning } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"bibliotek","plur":"bibliotek","art":"ett"};
export const SCHEMA_TYP = "Library";
export const TITEL_ORD = "öppettider";
export const KALLA = "Källor: Kungliga bibliotekets biblioteksdatabas och OpenStreetMap (© OpenStreetMaps bidragsgivare, ODbL).";

const MAN = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
const fran = (f) => (!f ? null : /^v\d+/.test(f) ? `vecka ${+f.slice(1)}` : `${+f.slice(3)} ${MAN[+f.slice(0, 2) - 1]}`);
export const KAT = laddaKatalog("data/bibliotek.json", {
  forbered: (e) => {
    const x = e.extra ?? {};
    const sommar = x.oppettider_sommar, vinter = x.oppettider_vinter;
    const annan = x.oppettider_sasong === "vinter" ? sommar && { namn: "Sommartider", s: sommar } : vinter && { namn: "Vintertider", s: vinter };
    return {
      ...e,
      fakta: [
        x.meroppet === true && { namn: "Meröppet", varde: x.meroppet_tider ? `Ja, ${typeof x.meroppet_tider === "string" ? x.meroppet_tider : veckoSammanfattning(x.meroppet_tider) ?? "med lånekort och PIN-kod"}` : "Ja, med lånekort och PIN-kod utanför ordinarie tider" },
        annan && annan.s.tider && { namn: annan.namn, varde: `${veckoSammanfattning(annan.s.tider) ?? ""}${annan.s.fran ? ` (${fran(annan.s.fran)}–${fran(annan.s.till)})` : ""}` },
      ].filter(Boolean),
    };
  },
});

export const SITE = {
  tema: "bibliotek",
  tagline: "Sveriges folkbibliotek",
  tjanstText: "Oberoende biblioteksguide · Uppgifter från Kungliga bibliotekets biblioteksdatabas",
  kallor: ["Kungliga biblioteket, Biblioteksdatabasen","© OpenStreetMap-bidragsgivare (ODbL)","SCB"],
  namn: "Biblioteken",
  visningsnamn: "biblioteken.nu",
  url: "https://biblioteken.nu",
  beskrivning: "Alla folkbibliotek i Sverige med adress, telefon och öppettider – se vilka bibliotek som har öppet nu och på helger. Uppdateras varje natt.",
  organisation: "biblioteken.nu",
  farg: "#7a3e9d",
  meny: [{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om biblioteken.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: Kungliga bibliotekets biblioteksdatabas och OpenStreetMap (© OpenStreetMaps bidragsgivare, ODbL).",
  natverk: [],
};
