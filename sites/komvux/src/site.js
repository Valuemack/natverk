import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"komvuxskola","plur":"komvuxskolor","art":"en"};
export const SCHEMA_TYP = "EducationalOrganization";
export const TITEL_ORD = "adress och utbildningar";
export const KALLA = "Källor: Skolverket (Skolenhetsregistret och kommunala jämförelsetal). Ansökan till komvux görs alltid hos din hemkommun.";

const NIVA = { "grundläggande": "Grundläggande nivå", "gymnasial": "Gymnasial nivå", "sfi": "Sfi (svenska för invandrare)", "anpassad grundläggande": "Anpassad utbildning, grundläggande", "anpassad gymnasial": "Anpassad utbildning, gymnasial" };
const ORDNING = Object.keys(NIVA);
export const nivaer = (e) => ORDNING.filter((n) => e.extra?.nivaer?.includes(n));
/** Grupp i kommunlistan: sfi, anpassad eller komvux. */
export const grupp = (e) => {
  const n = e.extra?.nivaer ?? [];
  if (n.length && n.every((x) => x === "sfi")) return "sfi";
  if (n.length && n.every((x) => x.startsWith("anpassad") || x === "sfi") && n.some((x) => x.startsWith("anpassad"))) return "anpassad";
  return "komvux";
};
const kort = (n) => ({ "grundläggande": "grundläggande", "gymnasial": "gymnasial", "sfi": "sfi", "anpassad grundläggande": "anpassad grundl.", "anpassad gymnasial": "anpassad gymn." })[n];

// Flera administrativa enheter (rektorsområden) delar ofta adress. Bara en per adress och kommun
// får egen sida – den med flest utbildningar, därefter kortast namn. Övriga listas på kommunsidan.
const RAA = JSON.parse(readFileSync(resolve(process.cwd(), "../skolor/data/komvux.json"), "utf8"));
const EGEN = new Set();
{
  const per = new Map();
  for (const e of Array.isArray(RAA) ? RAA : RAA.enheter) {
    if (!e.gatuadress) continue;
    const nyckel = `${e.kommunkod}|${e.gatuadress.toLowerCase().replace(/\s+/g, " ")}`;
    const b = per.get(nyckel);
    const poang = (x) => (x.extra?.nivaer?.length ?? 0) * 1000 - x.namn.length;
    if (!b || poang(e) > poang(b)) per.set(nyckel, e);
  }
  for (const e of per.values()) EGEN.add(e.id);
}

export const KAT = laddaKatalog("../skolor/data/komvux.json", {
  harEgenSida: (e) => EGEN.has(e.id) && !!(e.telefon || e.webb),
  forbered: (e) => {
    const x = e.extra ?? {};
    const n = nivaer(e);
    const anordnare = (x.entreprenad_anordnare ?? []).filter((a) => a.anordnare !== e.kedja);
    return {
      ...e,
      typ: grupp(e) === "sfi" ? "sfi" : grupp(e) === "anpassad" ? "anpassad utbildning för vuxna" : "komvux",
      listaRad: [n.map(kort).join(", "), x.huvudmanstyp === "enskild" ? "Fristående" : null].filter(Boolean).join(" · "),
      fakta: [
        n.length > 0 && { namn: "Utbildningar", varde: { __html: n.map((v) => NIVA[v]).join("<br>") } },
        x.skolnamn && x.skolnamn !== e.namn && { namn: "Del av", varde: x.skolnamn },
        x.huvudman_kommuner?.length > 0 && x.huvudman_kommuner.some((k) => k !== e.kommun) && { namn: "Huvudmannens kommun", varde: x.huvudman_kommuner.join(", ") },
        anordnare.length > 0 && { namn: "Utbildningsanordnare på entreprenad", varde: { __html: anordnare.map((a) => `${a.anordnare}${a.nivaer?.length ? ` <small>(${a.nivaer.map(kort).join(", ")})</small>` : ""}`).join("<br>") } },
        x.skolenhetskod && { namn: "Skolenhetskod", varde: x.skolenhetskod },
        x.startdatum && { namn: "Registrerad sedan", varde: x.startdatum.slice(0, 4) },
      ].filter(Boolean),
    };
  },
});

// Skolverkets kommunala jämförelsetal, nyckel = kommunkod ("00" = riket).
const STAT = JSON.parse(readFileSync(resolve(process.cwd(), "../skolor/data/kommunstatistik.json"), "utf8")).kommuner;
export const RIKET = { komvux: STAT["00"]?.komvux ?? null, sfi: STAT["00"]?.sfi ?? null };
export const statFor = (kommun) => STAT[kommun.enheter[0]?.kommunkod] ?? null;

export const SITE = {
  tema: "vuxen",
  tagline: "Komvux och sfi i alla kommuner",
  tjanstText: "Oberoende guide till vuxenutbildning · Uppgifter från Skolverket",
  kallor: ["Skolverket, Skolenhetsregistret","Skolverket, kommunala jämförelsetal"],
  namn: "Komvux",
  visningsnamn: "komvux.nu",
  url: "https://komvux.nu",
  beskrivning: "Komvux och sfi i alla Sveriges kommuner – skolor, utbildningsnivåer, distansstudier och statistik från Skolverket. Uppdateras varje natt.",
  organisation: "komvux.nu",
  farg: "#3b3f8f",
  meny: [{"namn":"Sfi","href":"/sfi/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om komvux.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: Skolverket (Skolenhetsregistret och kommunala jämförelsetal). Ansökan till komvux görs alltid hos din hemkommun.",
  natverk: [],
};
