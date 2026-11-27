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
const maxTid = (s) => String(s)
  .replace(/(\d+)\s*(?:hours?|timmar|timme|tim)\b/gi, (m, n) => `${n} ${n === "1" ? "timme" : "timmar"}`)
  .replace(/(\d+)\s*days?\b/gi, "$1 dygn").replace(/(\d+)\s*weeks?\b/gi, (m, n) => `${n} ${n === "1" ? "vecka" : "veckor"}`)
  .replace(/(\d+)\s*min(?:utes)?\b/gi, "$1 minuter");
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
import { harEgenSida, kommunHarSida, platser } from "./grind.js";
import { readFileSync, existsSync } from "node:fs";

const lasJson = (fil, reserv) => (existsSync(fil) ? JSON.parse(readFileSync(fil, "utf8")) : reserv);
/** Verifierade uppgifter (operatörens eller kommunens egen sida, med källa och datum) för de mest sökta anläggningarna. */
export const VERIFIERADE = new Map(lasJson("data/verifierade-anlaggningar.json", []).map((v) => [v.id, v]));
/** Kommunernas gatutaxor, boendeparkering, betalsätt och felparkeringsavgifter (kommunens egen webbplats, med datum). */
export const KOMMUNTAXOR = lasJson("data/kommuntaxor.json", {});
// Operatörernas egna flaggor (besöksparkering, endast uthyrning, inomhus, uppvärmt) från parkering-lek:s cache.
// Saknas cachen blir flaggorna tomma och grinden bedömer bara på övriga uppgifter.
const OP = new Map();
for (const op of ["aimo", "apcoa", "stockholmparkering"]) {
  for (const p of lasJson(`../parkering-lek/data/raw/operator-${op}.json`, { poster: [] }).poster ?? []) {
    if (p.webb) OP.set(p.webb, { endast_uthyrning: p.endast_uthyrning ?? null, kategori: p.kategori ?? null, inomhus: p.inomhus ?? null, uppvarmd: p.uppvarmd ?? null, besoksparkering: p.besoksparkering ?? null });
  }
}

export const KAT = laddaKatalog("../parkering-lek/data/parkeringar.json", {
  harEgenSida,
  forbered: (e0) => {
    const v = VERIFIERADE.get(e0.id) ?? null;
    const e = { ...e0, verifierad: v };
    const x1 = { ...(e.extra ?? {}), op: (e.webb && OP.get(e.webb)) || null };
    const x0 = v ? { ...x1, kapacitet: v.platser ?? x1.kapacitet, hojdbegransning: v.hojd_m ?? x1.hojdbegransning, laddplatser: v.laddplatser ?? x1.laddplatser, handikapplatser: v.hcp ?? x1.handikapplatser } : x1;
    if (!x0.kapacitet) x0.kapacitet = null;
    // Stockholm Parkerings sidor ger ibland samma tal för laddplatser som för alla platser (ex. Arenagaraget 761/761).
    // Det går inte att skilja från "alla platser förberedda", så talet visas inte om det inte är verifierat.
    if (!v?.laddplatser && x0.laddplatser && x0.kapacitet && x0.laddplatser >= x0.kapacitet && x0.kapacitet >= 20) x0.laddplatser = null;
    const x = v?.timpris != null ? { ...x0, taxa_per_timme: v.timpris, avgift: true } : x0.taxa ? { ...x0, taxa_per_timme: timpris(x0.taxa, x0.taxa_per_timme) } : x0;
    const kedja = e.kedja in KEDJA ? KEDJA[e.kedja] : e.kedja;
    const taxa = v?.taxa?.length ? v.taxa : taxaRader(x.taxa);
    return {
      ...e,
      extra: x,
      kedja,
      listaRad: [TYP[e.typ] ?? "Parkering", x.taxa_per_timme != null ? krTim(x.taxa_per_timme) : x.avgift === false ? "gratis" : null, x.kapacitet && `${x.kapacitet} platser`, x.max_tid && `max ${maxTid(x.max_tid)}`, x.laddplatser && "laddning"].filter(Boolean).join(" · "),
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

// Kommungrinden (src/grind.js). Kommuner utan egen sida visas som sektion på länssidan: /lan/<län>/#<kommun>,
// och deras parkeringar som rader där med ankaret <kommun>-<parkering>.
for (const k of KAT.kommuner) {
  k.harSida = kommunHarSida(k, !!KOMMUNTAXOR[k.namn]);
  k.taxa = KOMMUNTAXOR[k.namn] ?? null;
  const lan = KAT.lan.find((l) => l.slug === k.lanSlug);
  if (k.harSida) { for (const e of k.enheter) e.ankare = e.slug; continue; }
  k.href = `${lan.href}#${k.slug}`;
  for (const e of k.enheter) { e.egenSida = false; e.ankare = `${k.slug}-${e.slug}`; e.href = `${lan.href}#${e.ankare}`; }
}
export const MED_SIDA = KAT.kommuner.filter((k) => k.harSida);
export { maxTid, platser };

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
  meny: [{ namn: "Parkeringshus", href: "/parkeringshus/" }, { namn: "Gratis parkering", href: "/gratis-parkering/" }, { namn: "Pendlarparkering", href: "/pendlarparkering/" }, { namn: "Flygplats", href: "/flygplatsparkering/" }, { namn: "Guider", href: "/guider/" }, { namn: "Om", href: "/om/" }],
  sidfot: [
    { namn: "Guider om parkering", href: "/guider/" },
    { namn: "Om parkeringar.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: kommunernas öppna data, parkeringsoperatörernas webbplatser och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL). Kontrollera alltid skyltningen på plats.",
  natverk: [],
};
