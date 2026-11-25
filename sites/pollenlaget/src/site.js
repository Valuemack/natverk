import { idagStockholm, iso } from "@natverk/core/datum.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

const las = (fil, standard = null) => {
  const p = resolve(process.cwd(), "../api-data/data", fil);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : standard;
};

export const KALLA_NRM = "Palynologiska laboratoriet, Naturhistoriska riksmuseet";
export const KALLA = `Källa: ${KALLA_NRM} (Pollenrapporten). Prognoser återges oförändrade under CC BY-ND 4.0. Uppmätta halter och vår pollenkalender (bearbetning av uppmätta halter) under CC BY-SA 4.0.`;

/** Mätorter, utan riskprognosen för hela landet. */
const REGIONER_ALLA = las("pollen-regioner.json", []);
export const SVERIGE = REGIONER_ALLA.find((r) => r.hela_landet) ?? null;
export const REGIONER = REGIONER_ALLA.filter((r) => !r.hela_landet).sort((a, b) => b.lat - a.lat);
const TYPDATA = las("pollen-typer.json", { typer: [], nivaer: [] });
/** Pollenslag med prognoser (svampsporerna har bara mätningar och får ingen egen sida). */
export const TYPER = TYPDATA.typer.filter((t) => t.har_prognoser);
export const NIVAER = TYPDATA.nivaer ?? [];
export const nivaText = (n) => NIVAER.find((x) => x.niva === n)?.namn ?? ["Inga halter", "Låga", "Låga till måttliga", "Måttliga", "Måttliga till höga", "Höga", "Höga till mycket höga", "Mycket höga"][n] ?? "–";

const PROG = las("pollen-prognoser.json", { prognoser: [] });
export const PROGNOSER = PROG.prognoser ?? [];
export const prognosFor = (region) => PROGNOSER.find((p) => p.region_id === region.id) ?? null;
/** En prognos är aktuell om den gäller idag eller senare och inte är säsongens sista. */
export const aktuell = (p) => !!p && p.slut >= UPPDATERAD && p.dagar?.length > 0;
export const SASONG_PAGAR = PROGNOSER.some(aktuell);

const MAT = las("pollen-matningar.json", { matningar: [] });
export const MATNINGAR = MAT.matningar ?? [];
export const MATT_FRAN = MAT._meta?.fran, MATT_TILL = MAT._meta?.till;

const KAL = las("pollenkalender.json", { kalender: [], _meta: {} });
export const KALENDER = KAL.kalender ?? [];
export const KALENDER_AR = KAL._meta?.ar ?? [];
export const kalenderFor = (region, typ) => KALENDER.find((k) => k.region_slug === region.slug && k.pollen_slug === typ.slug) ?? null;

const MAN = ["jan", "feb", "mars", "april", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];
const MANLANG = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
/** "04-21" → "21 april" (lang) eller "21 april" / "21 aug" (kort). */
export const mmdd = (s, lang = true) => (s ? `${+s.slice(3, 5)} ${(lang ? MANLANG : MAN)[+s.slice(0, 2) - 1]}` : "–");
/** "2026-05-12" → "12 maj 2026". */
export const datumText = (s) => (s ? `${+s.slice(8, 10)} ${MANLANG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : "–");
export const kornText = (v) => (v == null ? "–" : `${Number(v).toLocaleString("sv-SE")} korn/m³`);

// Ungefärlig närmaste mätort per kommun (kommunens mittpunkt räknas från förskolornas koordinater).
const avst = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const kommunPunkter = (() => {
  const p = resolve(process.cwd(), "../skolor/data/forskolor.json");
  if (!existsSync(p)) return [];
  const m = new Map();
  for (const e of JSON.parse(readFileSync(p, "utf8"))) {
    if (e.lat == null || !e.kommun) continue;
    const x = m.get(e.kommun) ?? { namn: e.kommun, lat: 0, lon: 0, n: 0 };
    x.lat += e.lat; x.lon += e.lon; x.n++;
    m.set(e.kommun, x);
  }
  return [...m.values()].map((x) => ({ namn: x.namn, lat: x.lat / x.n, lon: x.lon / x.n }));
})();
/** Kommuner som ligger närmast en viss mätort (inom 150 km). */
export const kommunerNara = (region) => kommunPunkter
  .map((k) => ({ k, best: REGIONER.reduce((b, r) => (avst(k, r) < avst(k, b) ? r : b), REGIONER[0]) }))
  .filter(({ k, best }) => best.slug === region.slug && avst(k, region) < 150)
  .map(({ k }) => ({ namn: k.namn, km: Math.round(avst(k, region)) }))
  .sort((a, b) => a.km - b.km);

/** Egna korta fakta om varje pollenslag (inte från NRM). */
export const OM_TYP = {
  hassel: "Hassel blommar tidigt, ofta redan i februari i södra Sverige, och är säsongens första stora pollenslag.",
  al: "Al blommar samtidigt som eller strax efter hasseln. Många som reagerar på björk reagerar även på al och hassel.",
  "salg-och-viden": "Sälg och viden pollineras till stor del av insekter, så halterna i luften blir oftast låga.",
  alm: "Alm blommar på våren före lövsprickningen. Halterna är oftast låga.",
  bjork: "Björk är det pollenslag som flest i Sverige reagerar på. Säsongen är kort men intensiv, oftast från slutet av april till början av juni.",
  bok: "Bok växer främst i södra Sverige och blommar i maj, ungefär samtidigt som björkens sena del.",
  ek: "Ek blommar i maj och juni, främst i södra och mellersta Sverige.",
  gran: "Gran sprider stora mängder pollen vissa år. Granpollen anses sällan ge allergiska besvär.",
  tall: "Tallpollen syns ofta som gult damm på bilar och vatten i början av sommaren men ger sällan allergi.",
  gras: "Gräs blommar under hela sommaren, från slutet av maj till augusti. Gräspollen är det näst vanligaste pollenslaget som ger besvär.",
  grabo: "Gråbo blommar i slutet av sommaren, i juli och augusti, och växer gärna längs vägar och på ruderatmark.",
  malortsambrosia: "Malörtsambrosia (ambrosia) är en invasiv art som blommar i augusti och september. Pollenet kan också föras hit med vinden från kontinenten.",
};

export const SITE = {
  tema: "pollen",
  tagline: "Pollenprognoser för hela Sverige",
  tjanstText: `Oberoende pollentjänst · Prognoser och mätningar från ${KALLA_NRM}`,
  kallor: [`${KALLA_NRM} (Pollenrapporten)`],
  namn: "Pollenläget",
  visningsnamn: "pollenläget.se",
  url: "https://xn--pollenlget-w5a.se",
  beskrivning: "Dagens pollenprognos för 23 orter i Sverige – björk, gräs, hassel, al och fler pollenslag, med uppmätta halter och en pollenkalender som visar när säsongen brukar börja.",
  organisation: "pollenläget.se",
  farg: "#3d6b28",
  meny: [
    { namn: "Pollenkalender", href: "/pollenkalender/" },
    { namn: "Björk", href: "/pollen/bjork/" },
    { namn: "Gräs", href: "/pollen/gras/" },
    { namn: "Alla orter", href: "/#orter" },
    { namn: "Pollenallergi", href: "/guider/" },
    { namn: "Om", href: "/om/" },
  ],
  sidfot: [
    { namn: "Om pollenläget.se", href: "/om/" },
    { namn: "Källor och licenser", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: `Prognoser och mätdata: ${KALLA_NRM}. Prognostexterna återges oförändrade (CC BY-ND 4.0).`,
  natverk: [],
};
