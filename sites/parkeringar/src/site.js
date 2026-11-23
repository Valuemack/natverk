import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"parkering","plur":"parkeringar","art":"en"};
export const SCHEMA_TYP = "ParkingFacility";
export const TITEL_ORD = "pris och öppettider";
export const KALLA = "Källor: kommunernas öppna data, parkeringsoperatörernas webbplatser och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Kontrollera alltid skyltningen på plats.";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const KEDJA = { trafikverket: "Trafikverket", "okänd": null };
export const TYP = {
  parkeringshus: "Parkeringshus", parkeringsgarage: "Parkeringsgarage", markparkering: "Markparkering", gatuparkering: "Gatuparkering",
  pendlarparkering: "Pendlarparkering", flygplatsparkering: "Flygplatsparkering", friluftsparkering: "Friluftsparkering",
  rastficka: "Rastficka", husbilsparkering: "Husbilsparkering", takparkering: "Takparkering", parkering: "Parkering",
};
/** Taxetexten delas upp i rader; tomma rader och skräp ("Alla dagar 00-24:") tas bort. */
const taxaRader = (t) => (t ? t.split(/\s*[|;]\s*/).map((x) => x.replace(/:\s*$/, "").trim()).filter((x) => x && x.length > 2) : []);
export const krTim = (v) => (v === 0 ? "gratis" : `${String(v).replace(".", ",")} kr/tim`);
// OSM anger maxtid på engelska ("2 hours", "7 days").
const maxTid = (s) => String(s).replace(/(\d+)\s*hours?/i, (m, n) => `${n} ${n === "1" ? "timme" : "timmar"}`).replace(/(\d+)\s*days?/i, (m, n) => `${n} ${n === "1" ? "dygn" : "dygn"}`).replace(/(\d+)\s*min(utes)?/i, "$1 minuter");
// Ordinarie timpris för bil: första timtaxan i taxetexten (operatörerna listar ordinarie taxa först). MC-, boende- och abonnemangstaxor räknas inte,
// annars blir "4 kr/tim" (MC) parkeringens pris. Hittas inget timpris används källans värde.
const ANNAN_TAXA = /^(?:besöksparkering\s+)?(?:mc|motorcykel|motorvärmar\w*|boende|boendeparkering|hyresgäst\w*|abonnemang|månadskort)\b/i;
const tal = (s) => Number(s.replace(",", "."));
export function timpris(taxa, kalla) {
  if (!taxa) return kalla ?? null;
  const priser = [];
  for (const grupp of taxa.split("|")) {
    if (ANNAN_TAXA.test(grupp.trim())) continue;
    for (const del of grupp.split(";")) {
      const d = del.trim();
      if (ANNAN_TAXA.test(d) && d.length < 25) break;
      for (const m of d.matchAll(/(\d+(?:[,.]\d+)?)\s*kr\s*(?:\/\s*)?(?:per\s+)?(?:påbörjad\s+|påbörjade\s+)?(timmen|timme|tim|h)(?![a-zåäö])/gi)) priser.push(tal(m[1]));
      for (const m of d.matchAll(/(\d+(?:[,.]\d+)?)\s*kr\s*(?:\/\s*)?(?:per\s+)?påbörjade?\s+(\d+)\s*min/gi)) priser.push(Math.round((tal(m[1]) * 60) / Number(m[2])));
      for (const m of d.matchAll(/(\d+(?:[,.]\d+)?)\s*kr\s*(?:\/\s*)?(?:per\s+)?påbörjad\s+halvtimme/gi)) priser.push(tal(m[1]) * 2);
    }
  }
  const p = priser.filter((v) => v > 0 && v < 200);
  return p.length ? p[0] : kalla ?? null;
}
export const arGratis =(e) => e.extra?.avgift === false || e.extra?.taxa_per_timme === 0;

import { flygplatsFor } from "./flygplatser.js";
export const KAT = laddaKatalog("../parkering-lek/data/parkeringar.json", {
  harEgenSida: (e) => !!(e.extra?.taxa || e.oppettider || (e.gatuadress && e.extra?.kapacitet)),
  forbered: (e) => {
    const x0 = e.extra ?? {};
    const x = x0.taxa ? { ...x0, taxa_per_timme: timpris(x0.taxa, x0.taxa_per_timme) } : x0;
    const kedja = e.kedja in KEDJA ? KEDJA[e.kedja] : e.kedja;
    const taxa = taxaRader(x.taxa);
    return {
      ...e,
      extra: x,
      kedja,
      listaRad: [TYP[e.typ] ?? "Parkering", x.taxa_per_timme != null ? krTim(x.taxa_per_timme) : x.avgift === false ? "gratis" : null, x.kapacitet && `${x.kapacitet} platser`, x.laddplatser && "laddning"].filter(Boolean).join(" · "),
      fakta: [
        { namn: "Typ", varde: TYP[e.typ] ?? "Parkering" },
        x.avgift === false && { namn: "Avgift", varde: "Avgiftsfri enligt källan – kontrollera skyltningen" },
        x.taxa_per_timme != null && x.taxa_per_timme > 0 && { namn: "Pris per timme", varde: krTim(x.taxa_per_timme) },
        taxa.length > 0 && { namn: "Taxa", varde: { __html: taxa.map(esc).join("<br>") } },
        x.anmarkning && { namn: "Anmärkning", varde: x.anmarkning },
        x.max_tid && { namn: "Längsta parkeringstid", varde: maxTid(x.max_tid) },
        x.kapacitet && { namn: "Antal platser", varde: String(x.kapacitet) },
        x.laddplatser && { namn: "Laddplatser", varde: String(x.laddplatser) },
        x.handikapplatser && { namn: "Platser för rörelsehindrade", varde: String(x.handikapplatser) },
        x.hojdbegransning && { namn: "Höjdbegränsning", varde: `${String(x.hojdbegransning).replace(".", ",")} m` },
        x.zonkod && { namn: "Zonkod (för betalning i app)", varde: x.zonkod },
        x.taxezon_kommun?.namn && { namn: "Gatuparkering i närheten", varde: `${x.taxezon_kommun.namn}${x.taxezon_kommun.taxa ? `, ${x.taxezon_kommun.taxa}` : ""}` },
        flygplatsFor(e) && { namn: "Flygplats", varde: flygplatsFor(e) },
      ].filter(Boolean),
    };
  },
});

export const SITE = {
  tema: "trafik",
  tagline: "Parkering i hela Sverige",
  tjanstText: "Oberoende parkeringsguide · Uppgifter från kommuner, operatörer och OpenStreetMap",
  kallor: ["Kommunernas öppna data","Parkeringsoperatörernas anläggningssidor","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Parkeringar",
  visningsnamn: "parkeringar.nu",
  url: "https://parkeringar.nu",
  beskrivning: "Parkeringar i hela Sverige med pris per timme, öppettider, antal platser och laddplatser – parkeringshus, garage, pendlarparkeringar och gratis parkering. Uppdateras varje natt.",
  organisation: "parkeringar.nu",
  farg: "#1659a8",
  meny: [{"namn":"Parkeringshus","href":"/parkeringshus/"},{"namn":"Gratis parkering","href":"/gratis-parkering/"},{"namn":"Pendlarparkering","href":"/pendlarparkering/"},{"namn":"Flygplats","href":"/flygplatsparkering/"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om parkeringar.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: kommunernas öppna data, parkeringsoperatörernas webbplatser och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Kontrollera alltid skyltningen på plats.",
  natverk: [],
};
