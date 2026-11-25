import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"förskola","plur":"förskolor","art":"en"};
export const SCHEMA_TYP = "Preschool";
export const TITEL_ORD = "barngrupper";
export const KALLA = "Källor: SCB (öppna geodata, förskolor), Skolverket (kommunala jämförelsetal) och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Statistiken gäller hela kommunen, inte enskilda förskolor.";

export const KAT = laddaKatalog("../skolor/data/forskolor.json", {
  harEgenSida: (e) => !!(e.gatuadress && (e.telefon || e.webb || e.extra?.inriktning)),
  forbered: (e) => ({
    ...e,
    ort: e.extra?.tatort && !e.extra.tatort.includes(" och ") ? e.extra.tatort : e.ort,
    listaRad: [e.typ === "kommunal förskola" ? "Kommunal" : "Fristående", e.kedja && e.typ !== "kommunal förskola" && e.kedja !== e.namn && e.kedja, e.extra?.inriktning].filter(Boolean).join(" · "),
    fakta: [
      { namn: "Huvudman", varde: e.typ === "kommunal förskola" ? `${e.kommun} kommun` : (e.kedja ?? "Enskild huvudman") },
      e.extra?.inriktning && { namn: "Inriktning", varde: e.extra.inriktning },
      e.extra?.osm_kapacitet && { namn: "Antal platser", varde: String(e.extra.osm_kapacitet) },
    ].filter(Boolean),
  }),
});
// Skolverkets kommunala jämförelsetal, nyckel = kommunkod ("00" = riket).
const STAT = JSON.parse(readFileSync(resolve(process.cwd(), "../skolor/data/kommunstatistik.json"), "utf8")).kommuner;
export const RIKET = STAT["00"]?.forskola ?? null;
export const statFor = (kommun) => STAT[kommun.enheter[0]?.kommunkod]?.forskola ?? null;

export const SITE = {
  tema: "skola",
  tagline: "Alla förskolor i Sverige",
  tjanstText: "Oberoende förskoleguide · Statistik från Skolverket och SCB",
  kallor: ["SCB, öppna geodata Förskolor","Skolverket, kommunala jämförelsetal","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Förskolor",
  visningsnamn: "förskolor.nu",
  url: "https://xn--frskolor-n4a.nu",
  beskrivning: "Alla förskolor i Sverige per kommun – kommunala och fristående, med adress, barngruppernas storlek och andel förskollärare. Uppdateras varje natt.",
  organisation: "förskolor.nu",
  farg: "#1d5c63",
  meny: [{"namn":"Maxtaxa","href":"/maxtaxa/"},{"namn":"Guider","href":"/guider/"},{"namn":"Jämför kommuner","href":"/jamfor/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om förskolor.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: SCB (öppna geodata, förskolor), Skolverket (kommunala jämförelsetal) och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Statistiken gäller hela kommunen, inte enskilda förskolor.",
  natverk: [],
};
