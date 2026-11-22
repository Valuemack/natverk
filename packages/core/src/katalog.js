import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { FOLKMANGD, FOLKMANGD_AR } from "./folkmangd.js";

export { FOLKMANGD_AR };
export const FOLK_SVERIGE = Object.values(FOLKMANGD).reduce((a, b) => a + b, 0);

// Gemensam logik för katalogsajter (apotek, vårdcentraler, bibliotek, förskolor, loppisar …).
// Alla dataset följer samma schema:
// { id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb,
//   oppettider: { mon..sun: "08:00-17:00" | "08:00-12:00,13:00-17:00" | "stängt" | null } | null,
//   extra: {}, kallor: [], uppdaterad }

export const DAGAR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAGNAMN = { mon: "Måndag", tue: "Tisdag", wed: "Onsdag", thu: "Torsdag", fri: "Fredag", sat: "Lördag", sun: "Söndag" };
const SCHEMA_DAG = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** "Malmö" → "malmo", "Upplands Väsby" → "upplands-vasby". */
export function slug(text) {
  return String(text).toLowerCase()
    .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " och ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** "Stockholms län" → "Stockholm", "Skåne län" → "Skåne", "Dalarnas län" → "Dalarna". Inget länsnamn slutar på s i grundform. */
export function lanKortnamn(lan) {
  if (!lan) return null;
  return lan.replace(/\s+län$/i, "").replace(/s$/, "");
}

const tid = /^(\d{1,2})[:.](\d{2})$/;
/** "08:00-12:00,13:00-17:00" → [[480,720],[780,1020]], "stängt" → [], null → null. */
export function tolkaIntervall(v) {
  if (v == null || v === "") return null;
  if (/^stängt$/i.test(v)) return [];
  const ut = [];
  for (const del of String(v).split(/\s*,\s*/)) {
    const [a, b] = del.split(/\s*[-–]\s*/);
    const ma = tid.exec(a ?? ""), mb = tid.exec(b ?? "");
    if (!ma || !mb) return null;
    let slut = +mb[1] * 60 + +mb[2];
    const start = +ma[1] * 60 + +ma[2];
    if (slut <= start) slut += 24 * 60; // över midnatt / dygnet runt
    ut.push([start, slut]);
  }
  return ut;
}

export const harOppettider = (e) => !!e.oppettider && DAGAR.some((d) => tolkaIntervall(e.oppettider[d]) !== null);

/** Snygg text för en dag: "08–17", "08.30–12, 13–17", "Stängt", "Dygnet runt". */
export function dagText(v) {
  const iv = tolkaIntervall(v);
  if (iv === null) return "–";
  if (!iv.length) return "Stängt";
  const f = (m) => {
    const h = Math.floor(m / 60) % 24, mm = m % 60;
    return mm ? `${String(h).padStart(2, "0")}.${String(mm).padStart(2, "0")}` : String(h).padStart(2, "0");
  };
  if (iv.length === 1 && iv[0][1] - iv[0][0] >= 24 * 60 - 1) return "Dygnet runt";
  return iv.map(([a, b]) => `${f(a)}–${f(b)}`).join(", ");
}

/** schema.org openingHoursSpecification. Dagar utan känd tid utelämnas. */
export function openingHoursSpec(oppettider) {
  if (!oppettider) return undefined;
  const ut = [];
  for (const d of DAGAR) {
    const iv = tolkaIntervall(oppettider[d]);
    if (!iv) continue;
    const t = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (!iv.length) ut.push({ "@type": "OpeningHoursSpecification", dayOfWeek: SCHEMA_DAG[d], opens: "00:00", closes: "00:00" });
    for (const [a, b] of iv) ut.push({ "@type": "OpeningHoursSpecification", dayOfWeek: SCHEMA_DAG[d], opens: t(a), closes: b >= 24 * 60 ? "23:59" : t(b) });
  }
  return ut.length ? ut : undefined;
}

/** Öppet en viss veckodag (0 = mån) och minut? Tar hänsyn till intervall över midnatt. */
export function oppetVid(oppettider, dagIndex, minut) {
  if (!oppettider) return null;
  const idag = tolkaIntervall(oppettider[DAGAR[dagIndex]]);
  const igar = tolkaIntervall(oppettider[DAGAR[(dagIndex + 6) % 7]]);
  if (idag === null) return null;
  if (idag.some(([a, b]) => minut >= a && minut < b)) return true;
  if (igar && igar.some(([, b]) => b > 24 * 60 && minut < b - 24 * 60)) return true;
  return false;
}

export const oppetHelg = (e, dag) => {
  const iv = e.oppettider && tolkaIntervall(e.oppettider[dag]);
  return iv ? iv.length > 0 : null;
};
export const sentOppet = (e) => !!e.oppettider && DAGAR.slice(0, 5).some((d) => (tolkaIntervall(e.oppettider[d]) ?? []).some(([, b]) => b >= 20 * 60));

/** Avstånd i km (haversine). */
export function avstandKm(a, b) {
  if (a.lat == null || b.lat == null) return Infinity;
  const r = Math.PI / 180, R = 6371;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** De n närmaste enheterna (exklusive e själv), med avstånd. */
export function narmaste(e, alla, n = 5, filter = () => true, maxKm = 100) {
  if (e.lat == null) return [];
  return alla.filter((x) => x !== e && x.lat != null && filter(x))
    .map((x) => ({ enhet: x, km: avstandKm(e, x) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km).slice(0, n);
}

export const kmText = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`);

export const telLank = (t) => (t ? `tel:${t.replace(/[^\d+]/g, "").replace(/^0/, "+46")}` : null);
export const kartLank = (e) => e.lat != null
  ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.namn, e.gatuadress, e.ort].filter(Boolean).join(", "))}`;
export const adressRad = (e) => [e.gatuadress, [e.postnummer, e.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * Bygger katalogens indexstruktur: unika slugs per enhet inom kommun, grupper per kommun och län.
 * `harEgenSida(e)` avgör vilka enheter som är tillräckligt rika för en egen sida (annars listas
 * de bara på kommunsidan – inga tunna sidor).
 */
export function byggKatalog(enheter, { harEgenSida = (e) => !!(e.gatuadress && (harOppettider(e) || e.telefon)) } = {}) {
  const kommuner = new Map();
  // Nyckel = kommunnamn (unikt i Sverige). Slug-krockar (Håbo/Habo → "habo") får länet som suffix.
  const slugAnvand = new Map();
  for (const e of enheter) {
    if (!e.kommun) continue;
    if (!kommuner.has(e.kommun)) {
      let ks = slug(e.kommun);
      if (slugAnvand.has(ks)) ks = `${ks}-${slug(lanKortnamn(e.lan) ?? "")}`;
      slugAnvand.set(ks, e.kommun);
      kommuner.set(e.kommun, { slug: ks, namn: e.kommun, lan: e.lan, enheter: [] });
    }
    kommuner.get(e.kommun).enheter.push(e);
  }
  for (const k of kommuner.values()) {
    k.enheter.sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
    const anvanda = new Set();
    for (const e of k.enheter) {
      e.kommunSlug = k.slug;
      e.egenSida = harEgenSida(e);
      // Datans egen slug (stabil mellan körningar) går före en uträknad.
      let s = (e.slug && !anvanda.has(e.slug) ? e.slug : slug(e.namn)) || "enhet";
      if (anvanda.has(s) && e.gatuadress) s = `${s}-${slug(e.gatuadress)}`;
      let i = 2; const bas = s;
      while (anvanda.has(s)) s = `${bas}-${i++}`;
      anvanda.add(s);
      e.slug = s;
      e.href = e.egenSida ? `/${k.slug}/${s}/` : `/${k.slug}/#${s}`;
    }
    // Medelpunkt för kommunen (för "närmaste i grannkommuner").
    const med = k.enheter.filter((e) => e.lat != null);
    if (med.length) k.lat = med.reduce((s, e) => s + e.lat, 0) / med.length, k.lon = med.reduce((s, e) => s + e.lon, 0) / med.length;
    k.href = `/${k.slug}/`;
    k.folk = FOLKMANGD[k.namn] ?? null;
  }
  skiljLikaNamn([...kommuner.values()].flatMap((k) => k.enheter).filter((e) => e.egenSida));
  const lan = new Map();
  for (const k of kommuner.values()) {
    if (!k.lan) continue;
    const ls = slug(lanKortnamn(k.lan));
    if (!lan.has(ls)) lan.set(ls, { slug: ls, namn: k.lan, kortnamn: lanKortnamn(k.lan), kommuner: [] });
    lan.get(ls).kommuner.push(k);
    k.lanSlug = ls;
  }
  for (const l of lan.values()) {
    l.kommuner.sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
    l.antal = l.kommuner.reduce((s, k) => s + k.enheter.length, 0);
    l.folk = l.kommuner.every((k) => k.folk) ? l.kommuner.reduce((s, k) => s + k.folk, 0) : null;
    l.href = `/lan/${l.slug}/`;
  }
  return {
    enheter: enheter.filter((e) => e.kommunSlug),
    kommuner: [...kommuner.values()].sort((a, b) => a.namn.localeCompare(b.namn, "sv")),
    lan: [...lan.values()].sort((a, b) => a.namn.localeCompare(b.namn, "sv")),
  };
}

/**
 * Enheter med samma namn på samma ort (eller samma namn som redan innehåller orten) skulle få
 * identiska titlar. De får `e.skilj`: gatuadress om den skiljer dem åt, annars kommun, annars ett löpnummer.
 */
/** Namn som är långa gatulistor ("A-gatan / B-vägen / C-gatan …") kortas i titlar till de två första. */
export function titelNamn(namn) {
  const delar = namn.split(/\s*\/\s*/);
  return namn.length > 38 && delar.length > 2 ? `${delar.slice(0, 2).join(" / ")} m.fl.` : namn;
}

export function skiljLikaNamn(enheter) {
  const grupper = new Map();
  for (const e of enheter) {
    e.titelNamn = titelNamn(e.namn);
    const plats = (e.ort ?? e.kommun ?? "").toLowerCase();
    const harOrt = plats && e.namn.toLowerCase().includes(plats);
    // Samma nyckel som titelns början: "Namn, Ort" (eller bara namnet när det redan innehåller orten).
    const nyckel = harOrt ? e.titelNamn.toLowerCase() : `${e.titelNamn.toLowerCase()}, ${plats}`;
    if (!grupper.has(nyckel)) grupper.set(nyckel, []);
    grupper.get(nyckel).push(e);
  }
  for (const g of grupper.values()) {
    if (g.length < 2) continue;
    const unik = (f) => g.every((e) => f(e)) && new Set(g.map((e) => f(e).toLowerCase())).size === g.length;
    const adr = (e) => (e.gatuadress && !e.namn.toLowerCase().includes(e.gatuadress.toLowerCase()) ? e.gatuadress : "");
    if (unik(adr)) for (const e of g) e.skilj = adr(e);
    else if (unik((e) => e.kommun ?? "")) for (const e of g) e.skilj = `${e.kommun} kommun`;
    else g.forEach((e, i) => { e.skilj = [adr(e), `nr ${i + 1}`].filter(Boolean).join(" "); });
  }
}

/** Antal invånare per enhet, avrundat till "1 på 6 200". null om underlag saknas. */
export function invanarePer(folk, antal) {
  if (!folk || !antal) return null;
  const v = folk / antal;
  return v >= 10000 ? Math.round(v / 1000) * 1000 : v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10;
}
export const talText = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Kommunens täthet (invånare per enhet mot län och riket, plats bland alla kommuner) och de närmaste
 * enheterna utanför kommunen när den har få egna. Används av KatalogKommun och sajternas egna kommunsidor.
 */
export function kommunTathet(kat, k, ord, { maxEgna = 3, maxKm = 80 } = {}) {
  const n = k.enheter.length;
  const lan = kat.lan.find((l) => l.slug === k.lanSlug);
  const per = invanarePer(k.folk, n);
  const perRiket = invanarePer(FOLK_SVERIGE, kat.kommuner.reduce((s, x) => s + x.enheter.length, 0));
  const perLan = lan && invanarePer(lan.folk, lan.antal);
  const rangordnade = kat.kommuner.filter((x) => x.folk).sort((a, b) => b.enheter.length / b.folk - a.enheter.length / a.folk);
  const plats = rangordnade.indexOf(k) + 1;
  const text = per && perRiket ? `${n === 1
    ? `I ${k.namn} finns ${ord.art} ${ord.sing} på ${talText(k.folk)} invånare.`
    : `I ${k.namn} går det ${talText(n)} ${ord.plur} på ${talText(k.folk)} invånare – ungefär ${ord.art} på ${talText(per)} invånare.`} I hela landet är det ${ord.art} på ${talText(perRiket)}${perLan ? ` och i ${lan.namn} ${ord.art} på ${talText(perLan)}` : ""}.` : null;
  const utanfor = k.lat != null && n <= maxEgna
    ? kat.enheter.filter((e) => e.kommun !== k.namn && e.lat != null).map((e) => ({ enhet: e, km: avstandKm(k, e) }))
        .filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, 5)
    : [];
  return { text, plats, antal: rangordnade.length, utanfor, n };
}

/** Grannkommuner: närmaste kommuner (via medelpunkt) som inte är kommunen själv. */
export function grannkommuner(k, kommuner, n = 6, maxKm = 150) {
  if (k.lat == null) return [];
  return kommuner.filter((x) => x !== k && x.lat != null)
    .map((x) => ({ kommun: x, km: avstandKm(k, x) })).filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km).slice(0, n).map((x) => x.kommun);
}

/** schema.org-objekt för en enhet. */
export function enhetLd(e, site, schemaTyp) {
  const ld = {
    "@context": "https://schema.org",
    "@type": schemaTyp,
    name: e.namn,
    url: new URL(e.href, site.url).href,
    ...(e.telefon && { telephone: e.telefon }),
    ...(e.webb && { sameAs: [e.webb] }),
    ...(e.gatuadress && {
      address: {
        "@type": "PostalAddress", streetAddress: e.gatuadress, postalCode: e.postnummer ?? undefined,
        addressLocality: e.ort ?? e.kommun, addressRegion: e.lan ?? undefined, addressCountry: "SE",
      },
    }),
    ...(e.lat != null && { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lon } }),
    openingHoursSpecification: openingHoursSpec(e.oppettider),
    ...(e.kedja && { brand: { "@type": "Brand", name: e.kedja } }),
  };
  return ld;
}

/** Räkna förekomster: [["Apoteket", 12], ["Kronans", 8]]. */
export function rakna(lista, nyckel) {
  const m = new Map();
  for (const x of lista) { const k = nyckel(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv"));
}

const KORT = { mon: "mån", tue: "tis", wed: "ons", thu: "tors", fri: "fre", sat: "lör", sun: "sön" };
/** Kompakt veckosammanfattning: "mån–fre 08–19, lör 10–15, sön stängt". null om tider saknas. */
export function veckoSammanfattning(oppettider) {
  if (!oppettider) return null;
  const texter = DAGAR.map((d) => ({ d, t: dagText(oppettider[d]) }));
  if (texter.every((x) => x.t === "–")) return null;
  const grupper = [];
  for (const x of texter) {
    const g = grupper.at(-1);
    if (g && g.t === x.t) g.till = x.d; else grupper.push({ fran: x.d, till: x.d, t: x.t });
  }
  return grupper.filter((g) => g.t !== "–")
    .map((g) => `${KORT[g.fran]}${g.till !== g.fran ? `${DAGAR.indexOf(g.till) - DAGAR.indexOf(g.fran) > 1 ? "–" : ", "}${KORT[g.till]}` : ""} ${g.t.toLowerCase()}`)
    .join(", ");
}

/** Kompakt lista för klientens "Hitta närmaste" (/narmaste.json). */
// `f`: id:n för sajtens filter (Sokverktyg) som enheten uppfyller. `t`: öppettider för "öppet nu" i webbläsaren.
// `r`: en kort extra rad (t.ex. "Vattenkvalitet: utmärkt"). Fält utan värde utelämnas för att hålla filen liten.
export const narmasteJson = (kat, { filter = [], rad = () => null } = {}) => JSON.stringify(kat.enheter.filter((e) => e.lat != null).map((e) => {
  const f = filter.filter((x) => x.test && x.test(e)).map((x) => x.id);
  const t = harOppettider(e) ? Object.fromEntries(DAGAR.filter((d) => e.oppettider[d] != null).map((d) => [d, e.oppettider[d]])) : null;
  const r = rad(e);
  return {
    namn: e.namn, href: e.href, lat: +e.lat.toFixed(5), lon: +e.lon.toFixed(5), adress: adressRad(e) || e.ort || e.kommun,
    ...(f.length && { f }), ...(t && { t }), ...(r && { r }),
  };
}));

/**
 * Läser en datafil (relativt sajtmappen, eller env DATAFIL) och bygger katalogen.
 * Saknas filen blir katalogen tom – bygget går igenom men sajten har bara start/om-sidor.
 */
export function laddaKatalog(fil, { filter = () => true, forbered = (e) => e, ...opts } = {}) {
  const sokvag = resolve(process.cwd(), process.env.DATAFIL ?? fil);
  const enheter = existsSync(sokvag) ? JSON.parse(readFileSync(sokvag, "utf8")) : [];
  if (!enheter.length) console.warn(`[katalog] Ingen data i ${sokvag}`);
  return byggKatalog(enheter.filter((e) => e.namn && e.kommun && filter(e)).map(forbered), opts);
}
