import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"simhall","plur":"simhallar","art":"en"};
export const SCHEMA_TYP = "PublicSwimmingPool";
export const TITEL_ORD = "öppettider och priser";
export const KALLA = "Källor: kommunernas och badanläggningarnas webbplatser samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Kontrollera tiderna hos badet före besöket.";

const PRIS = { vuxen: "Vuxen", barn: "Barn", pensionar: "Pensionär", student: "Student", familj: "Familj" };
export const FACILITET = {
  motionssim: "Motionssim", simskola: "Simskola", babysim: "Babysim", vattengympa: "Vattengympa", barnbassang: "Barnbassäng",
  varmbassang: "Varmvattenbassäng", rutschkana: "Rutschkana", hopptorn: "Hopptorn", aventyrsbad: "Äventyrsbad",
  utomhusbassang: "Utomhusbassäng", bastu: "Bastu", relax: "Relax/spa", gym: "Gym", cafe: "Café", tillganglighet: "Tillgänglighetsanpassat",
};
export const harFacilitet = (e, k) => e.extra?.faciliteter?.[k] === true;
export const krText = (v) => (v === 0 ? "gratis" : `${v} kr`);
// Tider som skrapats från fel tabell (telefontider, bibliotek, gym …) används inte.
const FEL_TIDER = /telefontid|bibliotek|gym entré|nyckelgym|^stängt$|simtips|skriv tabell|funktionsnedsättning|aktuellt|^[|]/i;
// Längd visas bara för bassänger där en längd är rimlig.
const KORT_BASSANG = /bubbel|barn|plask|spa|varm|relax|jacuzzi|undervisning|lek|pluppen/i;
const bassangText = (b) => {
  const visaLangd = b.langd_m && !KORT_BASSANG.test(b.namn) && !b.namn.includes(String(b.langd_m));
  return [b.namn, visaLangd && `${b.langd_m} m`, b.banor && `${b.banor} banor`, b.temp_c && `${b.temp_c} °C`].filter(Boolean).join(", ");
};

export const KAT = laddaKatalog("data/simhallar.json", {
  harEgenSida: (e) => !!(e.oppettider || e.extra?.priser || e.gatuadress),
  forbered: (e) => {
    const x = e.extra ?? {};
    const tider = e.oppettider && !(x.oppettider_etikett && FEL_TIDER.test(x.oppettider_etikett.trim())) ? e.oppettider : null;
    const priser = Object.entries(PRIS).filter(([k]) => x.priser?.[k] != null).map(([k, n]) => `${n} ${krText(x.priser[k])}`);
    const fac = Object.entries(FACILITET).filter(([k]) => harFacilitet(e, k)).map(([, v]) => v);
    const bass = (x.bassanger ?? []).filter((b) => b.namn).map(bassangText);
    return {
      ...e,
      oppettider: tider,
      listaRad: [e.typ && e.typ[0].toUpperCase() + e.typ.slice(1), x.priser?.vuxen != null && `vuxen ${krText(x.priser.vuxen)}`, harFacilitet(e, "rutschkana") && "rutschkana", harFacilitet(e, "bastu") && "bastu"].filter(Boolean).join(" · "),
      fakta: [
        x.tillfalligt_stangd === true && { namn: "Obs!", varde: "Badets webbplats anger att anläggningen är tillfälligt stängd. Kontrollera innan du åker." },
        priser.length > 0 && { namn: "Entré", varde: priser.join(", ") },
        bass.length > 0 && { namn: "Bassänger", varde: { __html: bass.map((b) => b.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>") } },
        fac.length > 0 && { namn: "Finns här", varde: fac.join(", ") },
        tider && x.avvikande_tider && { namn: "Avvikande tider", varde: "Badet har avvikande tider vissa dagar, till exempel vid lov och helgdagar. Se badets webbplats." },
        x.senast_kontrollerad && x.oppettider_kalla === "webb" && { namn: "Uppgifterna kontrollerade", varde: x.senast_kontrollerad },
      ].filter(Boolean),
    };
  },
});

export const SITE = {
  tema: "sim",
  tagline: "Simhallar och badhus i hela Sverige",
  tjanstText: "Oberoende guide till simhallar · Uppgifter från kommuner och OpenStreetMap",
  kallor: ["Kommunernas och badens webbplatser","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Simhallar",
  visningsnamn: "simhallar.se",
  url: "https://simhallar.se",
  beskrivning: "Alla simhallar, badhus och äventyrsbad i Sverige med öppettider, priser och bassänger – se vilken simhall som har öppet nu. Uppdateras varje natt.",
  organisation: "simhallar.se",
  farg: "#007c91",
  meny: [{"namn":"Äventyrsbad","href":"/aventyrsbad/"},{"namn":"50 meter","href":"/50-meter/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om simhallar.se", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: kommunernas och badanläggningarnas webbplatser samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Kontrollera tiderna hos badet före besöket.",
  natverk: [],
};
