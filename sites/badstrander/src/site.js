import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"badplats","plur":"badplatser","art":"en"};
export const SCHEMA_TYP = "Beach";
export const TITEL_ORD = "vattenkvalitet";
export const KALLA = "Källa: Havs- och vattenmyndigheten (HaV), öppna data om badplatser och badvatten. Provtagning görs av kommunerna under badsäsongen.";

const klassText = (x) => {
  const k = [x.klassificering, ...(x.klassificeringar ?? [])].find((k) => k && !/pågår|ej klass/i.test(k.klass));
  return k ? `${k.klass} (${k.ar})` : null;
};
export const KAT = laddaKatalog("../api-data/data/badplatser.json", {
  harEgenSida: (e) => !!(e.extra?.antal_prov || e.extra?.beskrivning || e.extra?.sammanfattning),
  forbered: (e) => ({
    ...e,
    listaRad: [e.typ && e.typ[0].toUpperCase() + e.typ.slice(1), e.extra?.eu_badplats && "EU-badplats", klassText(e.extra ?? {})].filter(Boolean).join(" · "),
  }),
});

export const SITE = {
  tema: "vatten",
  tagline: "Badplatser och vattenkvalitet",
  tjanstText: "Oberoende badguide · Provsvar från Havs- och vattenmyndighetens öppna data",
  kallor: ["Havs- och vattenmyndigheten, Badplatser och badvatten"],
  namn: "Badstränder",
  visningsnamn: "badstränder.se",
  url: "https://xn--badstrnder-v5a.se",
  beskrivning: "Alla badplatser och badstränder i Sverige med vattenkvalitet, provsvar och badtemperatur – från Havs- och vattenmyndighetens öppna data. Uppdateras varje natt.",
  organisation: "badstränder.se",
  farg: "#0b6e99",
  meny: [{"namn":"Bästa vattenkvalitet","href":"/basta-vattenkvalitet/"},{"namn":"Guider","href":"/guider/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om badstränder.se", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källa: Havs- och vattenmyndigheten (HaV), öppna data om badplatser och badvatten. Provtagning görs av kommunerna under badsäsongen.",
  natverk: [],
};
