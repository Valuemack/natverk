// jourapotek.se: konfiguration och all data som sidorna bygger på.
// Grunddata: apotekslistan från apoteken.nu (Läkemedelsverkets register + kedjornas öppettider).
// Den här sajten visar TID: vem som har öppet sent, tidigt, på söndagar, helgdagar och dygnet runt.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { idagStockholm, iso, franIso, MANADER, VECKODAGAR } from "@natverk/core/datum.js";
import { byggKatalog, tolkaIntervall, dagText, DAGAR, avstandKm, adressRad } from "@natverk/core/katalog.js";
import { helgdagarAr } from "../../rodadagar/src/lib/helgdagar.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);
export const AR = IDAG.getUTCFullYear();

const las = (f, standard) => {
  const p = resolve(process.cwd(), f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : standard;
};

export const APOTEKEN_URL = "https://apoteken.nu";

export const SITE = {
  tema: "jour",
  tagline: "Apotek med öppet sent, söndag och helgdag",
  tjanstText: "Oberoende apoteksguide · Uppdateras varje natt",
  kallor: ["Läkemedelsverket (register över öppenvårdsapotek)", "Apotekskedjornas apotekssök och avvikande öppettider", "apoteken.nu"],
  namn: "Jourapotek",
  visningsnamn: "jourapotek.se",
  url: "https://jourapotek.se",
  beskrivning: "Hitta apotek som har öppet nu, sent på kvällen, tidigt på morgonen, på söndagar, helgdagar och dygnet runt – i hela Sverige, kommun för kommun.",
  organisation: "jourapotek.se",
  farg: "#0f6b5a",
  meny: [
    { namn: "Öppet nu", href: "/oppet-nu/" },
    { namn: "Öppet sent", href: "/oppet-sent/" },
    { namn: "Söndag", href: "/sondagsoppet/" },
    { namn: "Helgdagar", href: "/helgdagar/" },
    { namn: "Dygnet runt", href: "/dygnet-runt/" },
    { namn: "Kommuner", href: "/kommuner/" },
    { namn: "Guider", href: "/guider/" },
  ],
  sidfot: [
    { namn: "Om jourapotek.se", href: "/om/" },
    { namn: "Källor och metod", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Öppettiderna kommer från apotekskedjorna och Läkemedelsverkets register och uppdateras varje natt. Ring gärna apoteket innan du åker, särskilt på helgdagar. Sjukvårdsrådgivning: 1177. Akut: 112.",
  natverk: [],
};

// ---------- Tid ----------
export const kl = (m) => {
  if (m == null) return "–";
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${String(h).padStart(2, "0")}.${String(mm).padStart(2, "0")}`;
};
/** "21.00" men "24.00" för midnatt så att "öppet till 24" läses rätt. */
export const klSlut = (m) => (m != null && m % 1440 === 0 && m > 0 ? "24.00" : kl(m));
export const DAGNAMN_LITEN = { mon: "måndag", tue: "tisdag", wed: "onsdag", thu: "torsdag", fri: "fredag", sat: "lördag", sun: "söndag" };
export const DAGNAMN_PLUR = { mon: "måndagar", tue: "tisdagar", wed: "onsdagar", thu: "torsdagar", fri: "fredagar", sat: "lördagar", sun: "söndagar" };
export const VARDAGAR = DAGAR.slice(0, 5);
export const datumText = (s) => { const d = franIso(s); return `${d.getUTCDate()} ${MANADER[d.getUTCMonth()]}`; };
export const datumTextAr = (s) => `${datumText(s)} ${s.slice(0, 4)}`;
export const veckodagIso = (s) => VECKODAGAR[franIso(s).getUTCDay()];
/** Helgdagsnamn mitt i en mening: "julafton", men "Kristi himmelsfärdsdag" och "Sveriges nationaldag". */
export const fras = (s) => (/^(Kristi|Sveriges)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const lista = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} och ${arr.at(-1)}`);
export const st = (n, sing, plur) => `${n.toLocaleString("sv-SE")} ${n === 1 ? sing : plur}`;

// ---------- Apoteken ----------
const RAW = las("../apoteken/data/apotek.json", []);
// Samma urval och slug-regler som apoteken.nu, så att länkarna dit stämmer.
const KAT = byggKatalog(RAW.filter((e) => e.namn && e.kommun && (e.typ === "butik" || e.typ === "okänd")));

// Apotek på eller vid sjukhus: namnet eller adressen nämner sjukhuset (gatunamn som "Lasarettsgatan" räknas inte).
const SJUKHUS = /sjukhus|lasarett(?!sgatan)|akademiska|ryhov|sahlgrenska|karolinska|\bcsk\b|\busö\b|\bnus\b/i;

/** Avvikande tider (helgdagar m.m.) per datum, inklusive datumintervall (till). */
function avvikandePerDatum(e) {
  const ut = {};
  for (const a of e.avvikande_oppettider ?? []) {
    if (!a?.datum) continue;
    let d = a.datum;
    const slut = a.till ?? a.datum;
    for (let i = 0; i < 40 && d <= slut; i++) {
      ut[d] = { tid: a.tid, orsak: a.orsak || null };
      d = iso(new Date(franIso(d).getTime() + 86400000));
    }
  }
  return ut;
}

export const APOTEK = KAT.enheter.map((e) => {
  const iv = Object.fromEntries(DAGAR.map((d) => [d, tolkaIntervall(e.oppettider?.[d])]));
  const stanger = Object.fromEntries(DAGAR.map((d) => [d, iv[d]?.length ? Math.max(...iv[d].map(([, b]) => b)) : iv[d] ? 0 : null]));
  const oppnar = Object.fromEntries(DAGAR.map((d) => [d, iv[d]?.length ? Math.min(...iv[d].map(([a]) => a)) : null]));
  const harTider = DAGAR.some((d) => iv[d] !== null);
  const dygnet = harTider && DAGAR.every((d) => iv[d]?.some(([a, b]) => b - a >= 1439));
  return {
    id: e.id, namn: e.namn, kedja: e.kedja, kommun: e.kommun, kommunSlug: e.kommunSlug, lan: e.lan, ort: e.ort,
    adress: adressRad(e), gatuadress: e.gatuadress, telefon: e.telefon, lat: e.lat, lon: e.lon,
    oppettider: e.oppettider, iv, stanger, oppnar, harTider, dygnet,
    sjukhus: SJUKHUS.test(`${e.namn} ${e.gatuadress ?? ""}`),
    avvikande: avvikandePerDatum(e),
    lank: `${APOTEKEN_URL}${e.href}`,
  };
});
export const MED_TIDER = APOTEK.filter((a) => a.harTider);

/** Senaste stängningstid en vardag (mån–fre), i minuter. */
export const senastVardag = (a) => Math.max(0, ...VARDAGAR.map((d) => a.stanger[d] ?? 0));
/** Tidigaste öppning en vardag. */
export const tidigastVardag = (a) => Math.min(Infinity, ...VARDAGAR.map((d) => a.oppnar[d] ?? Infinity));
export const oppetDag = (a, d) => !!a.iv[d]?.length;

// ---------- Kommuner och län ----------
export const KOMMUNER = KAT.kommuner.map((k) => {
  const apotek = APOTEK.filter((a) => a.kommun === k.namn);
  return { slug: k.slug, namn: k.namn, lan: k.lan, lanSlug: k.lanSlug, lat: k.lat, lon: k.lon, apotek, medTider: apotek.filter((a) => a.harTider) };
}).filter((k) => k.apotek.length);
export const LAN = KAT.lan.map((l) => ({ slug: l.slug, namn: l.namn, kortnamn: l.kortnamn, kommuner: KOMMUNER.filter((k) => k.lan === l.namn) }));
export const kommunAv = (a) => KOMMUNER.find((k) => k.namn === a.kommun);

/** Sorteringsordning: senast stängning först, sedan namn. */
export const efterStangning = (d) => (x, y) => (y.stanger[d] ?? -1) - (x.stanger[d] ?? -1) || x.namn.localeCompare(y.namn, "sv");
export const efterOppning = (d) => (x, y) => (x.oppnar[d] ?? 9999) - (y.oppnar[d] ?? 9999) || x.namn.localeCompare(y.namn, "sv");

/** Närmaste apotek (utanför listan `utom`) som uppfyller villkoret, från en punkt. */
export function narmasteMed(punkt, villkor, n = 3, utom = new Set(), maxKm = 150) {
  if (punkt?.lat == null) return [];
  return MED_TIDER.filter((a) => a.lat != null && !utom.has(a) && villkor(a))
    .map((a) => ({ a, km: avstandKm(punkt, a) })).filter((x) => x.km <= maxKm)
    .sort((x, y) => x.km - y.km).slice(0, n);
}
export const kmText = (km) => (km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`);

// ---------- Stadsdelar i storstäderna ----------
// Avgränsade med postort (t.ex. Bromma) eller postnummerområde (t.ex. 116/118 = Södermalm).
// Bara områden med minst tre apotek får en egen sida.
const pnr = (a) => a.adress.match(/\b(\d{3}) ?\d{2} [^\d,]+$/)?.[1]; // postnumret före postorten sist i adressen
const postort = (...orter) => (a) => orter.includes((a.ort ?? "").toLowerCase());
const kod = (...koder) => (a) => koder.includes(pnr(a));
const OMRADE_DEF = {
  Stockholm: [
    ["norrmalm", "Norrmalm och City", "Sergels torg, Centralen, Hötorget och Norrmalm", (a) => kod("111")(a) && !/lindhagen/i.test(a.adress)],
    ["kungsholmen", "Kungsholmen", "Fridhemsplan, S:t Eriksplan och Lindhagen", (a) => kod("112")(a) || /lindhagen/i.test(a.adress)],
    ["vasastan", "Vasastan", "Odenplan, Sankt Eriksplan och Vasastan", kod("113")],
    ["ostermalm", "Östermalm", "Stureplan, Karlaplan, Östermalmstorg och Gärdet", kod("114", "115")],
    ["sodermalm", "Södermalm", "Medborgarplatsen, Slussen, Skanstull och Hornstull", (a) => kod("116", "118")(a) || (kod("117")(a) && !/liljeholm|gröndal/i.test(a.adress))],
    ["liljeholmen", "Liljeholmen och Gröndal", "Liljeholmstorget och Gröndal", (a) => kod("117")(a) && /liljeholm|gröndal/i.test(a.adress)],
    ["hammarby-sjostad", "Hammarby sjöstad och Årsta", "Hammarby allé och Årsta", (a) => kod("120")(a)],
    ["johanneshov", "Johanneshov", "Gullmarsplan, Globen och Skärholmen söderut", postort("johanneshov")],
    ["hagersten", "Hägersten", "Hägerstensåsen, Fruängen, Västertorp och Mälarhöjden", postort("hägersten")],
    ["bromma", "Bromma", "Brommaplan, Alvik och Bromma Blocks", postort("bromma")],
    ["kista", "Kista", "Kista Galleria och Husby", postort("kista")],
    ["spanga", "Spånga", "Spånga, Tensta och Rinkeby", postort("spånga")],
    ["skarholmen", "Skärholmen", "Skärholmens centrum och Kungens kurva", postort("skärholmen")],
    ["bandhagen", "Bandhagen och Högdalen", "Högdalen, Bandhagen och Stureby", postort("bandhagen")],
    ["farsta", "Farsta", "Farsta centrum", postort("farsta")],
    ["enskede-skarpnack", "Enskede och Skarpnäck", "Gubbängen, Enskededalen, Skarpnäck, Bagarmossen och Sköndal", postort("enskede", "enskededalen", "skarpnäck", "bagarmossen", "sköndal")],
    ["vallingby", "Vällingby", "Vällingby centrum", postort("vällingby")],
    ["hasselby", "Hässelby", "Hässelby gård och Hässelby strand", postort("hässelby")],
    ["alvsjo", "Älvsjö", "Älvsjö centrum", postort("älvsjö")],
  ],
  Göteborg: [
    ["centrum", "Göteborg centrum", "Nordstan, Centralen och Inom Vallgraven", kod("411")],
    ["johanneberg-garda", "Johanneberg och Gårda", "Korsvägen, Gårda och Krokslätt", kod("412")],
    ["linne-majorna", "Linné och Majorna", "Linnégatan, Masthugget och Majorna", kod("413", "414")],
    ["ostra-goteborg", "Östra Göteborg", "Gamlestaden, Kortedala, Redbergslid och Östra sjukhuset", kod("415", "416")],
    ["hisingen", "Hisingen", "Backaplan, Eriksberg, Bäckebol och Torslanda", (a) => kod("417", "418")(a) || postort("hisings backa", "hisings kärra", "torslanda")(a)],
    ["vastra-frolunda", "Västra Frölunda", "Frölunda torg, Askim och Hovås", postort("västra frölunda", "askim", "hovås")],
    ["angered", "Angered", "Angered centrum och Gårdsten", postort("angered")],
  ],
  Malmö: [
    ["centrum", "Malmö centrum", "Gamla staden, Triangeln och Västra hamnen", kod("211")],
    ["limhamn", "Limhamn", "Limhamn och Bunkeflostrand", (a) => kod("216")(a) || postort("limhamn", "bunkeflostrand")(a)],
    ["vastra-malmo", "Västra Malmö", "Kronprinsen och Västra innerstaden", kod("217")],
    ["sodra-innerstaden", "Södra innerstaden och Mobilia", "Möllevången, Södervärn och Mobilia", kod("214")],
    ["ostra-malmo", "Östra Malmö", "Rosengård, Jägersro och Värnhem", kod("212", "213")],
    ["hyllie-fosie", "Hyllie och Fosie", "Emporia, Hyllie och Lindängen", kod("215")],
  ],
};
export const OMRADEN = Object.entries(OMRADE_DEF).flatMap(([kommun, lista]) => {
  const k = KOMMUNER.find((x) => x.namn === kommun);
  if (!k) return [];
  return lista.map(([slug, namn, platser, test]) => {
    const apotek = k.apotek.filter(test);
    const med = apotek.filter((a) => a.lat != null);
    return {
      slug, namn, platser, kommun: k, apotek, medTider: apotek.filter((a) => a.harTider),
      lat: med.length ? med.reduce((x, a) => x + a.lat, 0) / med.length : null,
      lon: med.length ? med.reduce((x, a) => x + a.lon, 0) / med.length : null,
    };
  }).filter((o) => o.medTider.length >= 3);
});
export const omradenI = (k) => OMRADEN.filter((o) => o.kommun.slug === k.slug);

// ---------- Helgdagar ----------
// Helgtider som sparats tidigare nätter (kedjorna publicerar bara några dagar framåt), se scripts/historik.mjs.
export const HELGTIDER = las("data/helgtider.json", { datum: {} });

/** Alla helgdagar och helgaftnar från idag och ett år framåt, plus de senaste 12 månaderna. */
const helgListaFor = (y) => helgdagarAr(y).map((h) => ({ ...h, iso: iso(h.datum) }));
const ALLA_HELGER = [...helgListaFor(AR - 1), ...helgListaFor(AR), ...helgListaFor(AR + 1)];
/** Helgdagar som får egna sidor (de som söks mest). Pingst och alla helgons dag ingår. */
export const HELGDAGAR = [...new Map(ALLA_HELGER.map((h) => [h.slug, h])).values()].map((h) => {
  const nasta = ALLA_HELGER.find((x) => x.slug === h.slug && x.iso >= UPPDATERAD);
  const forra = [...ALLA_HELGER].reverse().find((x) => x.slug === h.slug && x.iso < UPPDATERAD);
  return { slug: h.slug, namn: h.namn, kort: h.kort, typ: h.typ, regel: h.regel, nasta: nasta?.iso, forra: forra?.iso };
}).sort((a, b) => a.nasta.localeCompare(b.nasta));

/** Tider för ett datum: först kedjans avvikande tid, annars sparad historik. null = okänt. */
export function tidPaDatum(a, datumIso) {
  const av = a.avvikande[datumIso];
  if (av) return { tid: av.tid, kalla: "avvikande" };
  const h = HELGTIDER.datum?.[datumIso]?.[a.id];
  if (h) return { tid: h, kalla: "sparad" };
  return null;
}
/** Avvikande tider från igår och 30 dagar framåt, för klientskriptet: { "YYYY-MM-DD": "10:00-15:00" }. */
const IGAR = iso(new Date(IDAG.getTime() - 86400000)), OM30 = iso(new Date(IDAG.getTime() + 30 * 86400000));
export const avvikandeFram = (a) => Object.fromEntries(Object.entries(a.avvikande).filter(([d]) => d >= IGAR && d <= OM30).map(([d, v]) => [d, v.tid]));
/** Status per apotek ett visst datum: { a, tid, iv, oppet } för apotek med kända tider. */
export function helgStatus(datumIso, urval = MED_TIDER) {
  return urval.map((a) => {
    const t = tidPaDatum(a, datumIso);
    if (!t) return null;
    const iv = tolkaIntervall(t.tid);
    if (iv === null) return null;
    return { a, tid: dagText(t.tid), iv, oppet: iv.length > 0, stanger: iv.length ? Math.max(...iv.map(([, b]) => b)) : null, oppnar: iv.length ? Math.min(...iv.map(([x]) => x)) : null };
  }).filter(Boolean);
}

// ---------- Kompakt data för klientskript (/data/tider.json) ----------
export const tiderJson = () => JSON.stringify(MED_TIDER.filter((a) => a.lat != null).map((a) => ({
  n: a.namn, k: a.kommun, s: a.kommunSlug, a: a.adress, la: +a.lat.toFixed(5), lo: +a.lon.toFixed(5), t: a.oppettider, u: a.lank,
})));

export { DAGAR, dagText, tolkaIntervall };
