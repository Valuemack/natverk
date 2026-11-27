// Fördjupad data per namn för namnsidorna: nyfödda per år (SCB), medelålder (SCB), ursprung
// (svenska Wikipedia, CC BY-SA 4.0), kända personer (Wikidata, CC0) och liknande namn.
// Allt läses med fs vid bygget. Saknas en källa för ett namn visas inget – inget fylls i.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ALLA_NAMN, SAMMANSLAGNA, UTAN_NAMNSDAG, SCB_ALLA, stavNyckel } from "../site.js";
import { MEDELALDER } from "./statistik.js";

const las = (f, standard = null) => {
  const p = join(process.cwd(), "data", f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : standard;
};
const NYF = las("nyfodda-alla.json");
const WIKI = las("wikipedia-namn.json", { namn: {} });
const PERS = las("wikidata-personer.json", { namn: {} });

export const NYF_ALLA_AR = NYF.ar; // [1998 … 2022]
export const NYF_KALLA = NYF.kalla;
export const WIKI_LICENS = WIKI.licens;
export const WIKI_HAMTAD = WIKI.hamtad;
export const PERS_HAMTAD = PERS.hamtad;

/** Nyfödda per år och kön: [{ ar, K, M, x }] (0 där SCB inte redovisar namnet, dvs. färre än 2 barn). */
export function nyfodda(namn) {
  const d = NYF.namn[namn];
  if (!d) return [];
  return NYF.ar.map((ar, i) => ({ ar, K: d.K?.[i] ?? 0, M: d.M?.[i] ?? 0, x: (d.K?.[i] ?? 0) + (d.M?.[i] ?? 0) }));
}

/** Trend för nyfödda: medel 2018–2022 jämfört med 2013–2017. */
export function trend(serie) {
  if (!serie.length) return null;
  const medel = (a, b) => serie.filter((r) => r.ar >= a && r.ar <= b).reduce((s, r) => s + r.x, 0) / (b - a + 1);
  const nu = medel(2018, 2022), fore = medel(2013, 2017);
  if (nu < 2 && fore < 2) return null;
  const f = fore ? (nu - fore) / fore : 1;
  // Samma gräns (±10 %) som filtret "ökar/minskar" i /hitta-barnnamn/, så sidorna inte säger emot varandra.
  return { nu, fore, forandring: f, ord: f >= 0.5 ? "ökar kraftigt" : f >= 0.1 ? "ökar" : f <= -0.5 ? "minskar kraftigt" : f <= -0.1 ? "minskar" : "ligger ungefär still" };
}

/** Medelålder 2020 för dem som har namnet som tilltalsnamn (SCB, namn med minst 100 bärare). */
export function medelalder(namn) {
  const m = MEDELALDER[namn];
  if (!m) return null;
  const K = m.K ?? null, M = m.M ?? null;
  // Vägt medel för båda könen
  const n = (m.nK ?? 0) + (m.nM ?? 0);
  const total = n ? (((K ?? 0) * (m.nK ?? 0)) + ((M ?? 0) * (m.nM ?? 0))) / n : null;
  return { K, M, total: total && Math.round(total * 10) / 10 };
}

/** Placering bland alla tilltalsnamn 2020 (båda könen), 1 = vanligast. */
const RANG = new Map(Object.entries(SCB_ALLA).map(([n, a]) => [n, a[0] + a[1]]).sort((a, b) => b[1] - a[1]).map(([n], i) => [n, i + 1]));
export const ANTAL_TILLTALSNAMN = RANG.size;
export const rang = (namn) => RANG.get(namn) ?? null;
/** SCB-siffror 2020: { K, M, tilltal, fornamn, t2000 } */
export function scb(namn) {
  const a = SCB_ALLA[namn];
  if (!a) return null;
  return { K: a[0], M: a[1], tilltal: a[0] + a[1], fornamn: a[2] + a[3], t2000: a[4] };
}

/** Ursprung och betydelse ur svenska Wikipedia (ordagrant citat) eller null. */
// Hänvisningsrader ("För andra betydelser, se …") och meningar om andra namn tas bort; högst två meningar.
const BORT = /(för andra betydelser|olika betydelser|se även|liknande namnet|annan etymologi|registrerade som|kan syfta på|kan avse|källa behövs|\[)/i;
// Citatet ska börja med en mening som nämner namnet (annars blir det obegripligt utan sammanhang).
export function rensaUrsprung(text, namn, titel = "") {
  const ord = [namn, titel.replace(/\s*\(.*\)$/, "")].filter(Boolean);
  const m = (text ?? "").split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/).filter((s) => !BORT.test(s));
  const start = m.findIndex((s) => ord.some((o) => s.includes(o)) || /^(Namnet|Mansnamnet|Kvinnonamnet)\b/.test(s));
  return start < 0 ? null : m.slice(start, start + 2).join(" ").trim() || null;
}
export const ursprung = (namn) => {
  const w = WIKI.namn[namn];
  const text = rensaUrsprung(w?.ursprung, namn, w?.titel);
  return text ? { ...w, ursprung: text } : null;
};
/** Kända personer med namnet (Wikidata, personer med artikel på svenska Wikipedia). */
export const personer = (namn) => PERS.namn[namn] ?? [];

// ---------- Liknande namn ----------
// Alla namn som har en egen sida (almanackan + vanliga namn utan namnsdag).
let SIDNAMN = [
  ...ALLA_NAMN.filter((n) => !SAMMANSLAGNA.has(n.namn)).map((n) => ({ namn: n.namn, slug: n.slug, datum: n.datum, fran: n.fran ?? null, typ: "namn" })),
  ...UTAN_NAMNSDAG.map((x) => ({ namn: x.namn, slug: x.slug, datum: x.huvud?.datum ?? null, huvud: x.huvud?.namn ?? null, typ: x.huvud ? "variant" : "utan" })),
];
let PER_NYCKEL, PER_WIKI;
function indexera() {
  PER_NYCKEL = new Map();
  PER_WIKI = new Map();
  for (const s of SIDNAMN) {
    const k = stavNyckel(s.namn);
    (PER_NYCKEL.get(k) ?? PER_NYCKEL.set(k, []).get(k)).push(s);
    const w = WIKI.namn[s.namn]?.titel;
    if (w) (PER_WIKI.get(w) ?? PER_WIKI.set(w, []).get(w)).push(s);
  }
}
indexera();
/**
 * Liknande namn med egen sida: samma stavning med andra bokstäver (Mattias/Matthias/Mathias),
 * almanacksnamn och dess varianter, och namn som svenska Wikipedia beskriver i samma artikel.
 */
export function liknande(namn, huvud = null) {
  const ut = new Map();
  const lagg = (xs) => { for (const s of xs ?? []) if (s.namn !== namn) ut.set(s.namn, s); };
  lagg(PER_NYCKEL.get(stavNyckel(namn)));
  if (huvud) { lagg(SIDNAMN.filter((s) => s.namn === huvud)); lagg(PER_NYCKEL.get(stavNyckel(huvud))); }
  lagg(SIDNAMN.filter((s) => s.huvud && s.huvud === namn));
  const w = WIKI.namn[namn]?.titel;
  if (w) lagg(PER_WIKI.get(w));
  return [...ut.values()].map((s) => ({ ...s, antal: scb(s.namn)?.tilltal ?? 0 })).sort((a, b) => b.antal - a.antal).slice(0, 12);
}

/** Bärare per sidnamn, för "Visste du?" och pressidan. */
export let SIDOR_NAMN = SIDNAMN;

/** 5–8 kända personer: upp till fem svenska, resten de mest omskrivna, ordnade efter antal språkversioner. */
export function kandaPersoner(namn, max = 8) {
  const alla = personer(namn);
  const sv = alla.filter((p) => /svensk/i.test(p.beskr ?? "")).slice(0, 5);
  const ovr = alla.filter((p) => !sv.includes(p));
  return [...sv, ...ovr].slice(0, max).sort((a, b) => (b.sprak ?? 0) - (a.sprak ?? 0));
}

// ---------- Placering bland nyfödda (SCB) ----------
// Plats bland alla namn som SCB redovisar för nyfödda av samma kön ett visst år (1 + antal namn med fler barn).
const RANG_NYF = { K: null, M: null };
function rangTabell(kon) {
  if (RANG_NYF[kon]) return RANG_NYF[kon];
  const rader = Object.values(NYF.namn).map((d) => d[kon] ?? []);
  RANG_NYF[kon] = NYF.ar.map((_, i) => rader.map((r) => r[i] ?? 0).filter((x) => x > 0).sort((a, b) => b - a));
  return RANG_NYF[kon];
}
/** [{ ar, plats, x, av }] för namnets vanligaste kön bland nyfödda; kon = "K" | "M". */
export function nyfRang(namn) {
  const d = NYF.namn[namn];
  if (!d) return null;
  const sum = (xs) => (xs ?? []).reduce((a, b) => a + b, 0);
  const kon = sum(d.K) >= sum(d.M) ? "K" : "M";
  const t = rangTabell(kon);
  const rader = NYF.ar.map((ar, i) => {
    const x = d[kon]?.[i] ?? 0;
    if (!x) return null;
    // binärsökning: antal värden > x i fallande lista
    let lo = 0, hi = t[i].length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[i][m] > x) lo = m + 1; else hi = m; }
    return { ar, plats: lo + 1, x, av: t[i].length };
  }).filter(Boolean);
  return rader.length ? { kon, rader, bast: rader.reduce((a, r) => (r.plats < a.plats ? r : a)) } : null;
}

// ---------- Samma namn i andra former (Wikidata P460) ----------
const WDN = las("wikidata-namn.json", { namn: {}, hamtad: null });
export const WDN_HAMTAD = WDN.hamtad;
// Namnsdag i andra länder: Wikidata P1750 (skript 12). Bara det Wikidata anger per namn.
const WDD = las("wikidata-namnsdagar.json", { namn: {}, hamtad: null });
export const WDD_HAMTAD = WDD.hamtad;
// Dubbelnamn (med bindestreck) i SCB:s statistik, sorterade efter antal med namnet som tilltalsnamn 2020.
const DUBBEL = Object.entries(SCB_ALLA).filter(([n]) => n.includes("-")).map(([namn, a]) => ({ namn, antal: a[0] + a[1] })).filter((x) => x.antal > 0).sort((a, b) => b.antal - a.antal);
const delarAv = (n) => n.toLowerCase().split("-");
/** För ett dubbelnamn: placering bland alla dubbelnamn och andra dubbelnamn med samma delar (SCB 2020). */
export function dubbelnamn(namn) {
  if (!namn.includes("-")) return null;
  const plats = DUBBEL.findIndex((x) => x.namn === namn) + 1;
  const delar = delarAv(namn);
  const perDel = delar.map((d) => ({ del: d, antal: DUBBEL.filter((x) => delarAv(x.namn).includes(d)).length, ovriga: DUBBEL.filter((x) => x.namn !== namn && delarAv(x.namn).includes(d)).slice(0, 6) }));
  return plats ? { plats, av: DUBBEL.length, perDel } : null;
}
/** Namnsdagar i andra länder: [{ land, datum }] (datum = mmdd). */
export const utlandskaDagar = (namn) => WDD.namn[namn] ?? [];
const OMVAND = new Map();
for (const [n, x] of Object.entries(WDN.namn)) for (const s of x.samma ?? []) (OMVAND.get(s) ?? OMVAND.set(s, new Set()).get(s)).add(n);
let SIDA_AV = new Map(SIDNAMN.map((s) => [s.namn, s]));
const ALM_AV = new Map(ALLA_NAMN.filter((n) => !n.fran || n.fran <= new Date().getUTCFullYear()).map((n) => [n.namn, n]));
/**
 * Namn som Wikidata säger är samma namn (åt båda hållen) och som finns i Sverige: minst 10 bärare enligt SCB 2020
 * eller i almanackan. [{ namn, antal, slug, datum }] sorterade efter antal bärare.
 */
export function sammaNamn(namn, utesluta = []) {
  const ut = new Set([...(WDN.namn[namn]?.samma ?? []), ...(OMVAND.get(namn) ?? [])]);
  const bort = new Set([namn, ...utesluta]);
  return [...ut].filter((s) => !bort.has(s) && ((scb(s)?.tilltal ?? 0) >= 10 || ALM_AV.has(s)))
    .map((s) => ({ namn: s, antal: scb(s)?.tilltal ?? 0, slug: SIDA_AV.get(s)?.slug ?? null, datum: ALM_AV.get(s)?.datum ?? null }))
    .sort((a, b) => b.antal - a.antal).slice(0, 10);
}

// ---------- Namnet jämfört med almanackans namn ----------
const ALM_BARARE = [...ALM_AV.values()].map((n) => scb(n.namn)?.tilltal ?? 0).sort((a, b) => a - b);
/** Hur många av almanackans namn som har färre bärare (SCB 2020) än antal. */
export function farreIAlmanackan(antal) {
  let lo = 0, hi = ALM_BARARE.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ALM_BARARE[m] < antal) lo = m + 1; else hi = m; }
  return { farre: lo, av: ALM_BARARE.length };
}

// ---------- Dubbelnamn: delarna i almanackan ----------
const VARIANT_AV = new Map(UTAN_NAMNSDAG.filter((x) => x.huvud).map((x) => [x.namn, x.huvud]));
const versal = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
/** För dubbelnamn (Britt-Marie, Lars-Erik): delar som har namnsdag, direkt eller som stavningsvariant. [{ del, namn, datum }] */
export function delnamn(namn) {
  if (!/[- ]/.test(namn)) return [];
  return namn.split(/[- ]/).map(versal).map((del) => {
    const alm = ALM_AV.get(del) ?? VARIANT_AV.get(del);
    return alm ? { del, namn: alm.namn, datum: alm.datum } : null;
  }).filter(Boolean);
}

// ---------- Kvalitetsgrind för namn utan namnsdag (SEO-playbook §0: inga tunna sidor) ----------
// Ett namn utan namnsdag får egen sida om det har många bärare (MIN_BARARE_SIDA), ökar bland nyfödda (snitt 2018–2022
// minst 10 % över 2013–2017 och minst MIN_NYF_SIDA barn per år), är vanligt bland nyfödda (snitt 2018–2022 minst
// MIN_NYF_POPULAR barn per år) eller har minst MIN_BLOCK unika datablock (ägarens
// beslut 2026-11-27: populära namn behålls och berikas). Övriga 301-omdirigeras: stavningsvarianter till
// almanacksnamnets sida, övriga till sin rad på /namn-utan-namnsdag/. Aldrig noindex.
export const MIN_BLOCK = 4;
export const MIN_BARARE_SIDA = 2000;
export const MIN_NYF_SIDA = 10;
export const MIN_NYF_POPULAR = 50;
/** Varför ett namn utan namnsdag får egen sida, eller null. */
export function skalForSida(x, b = datablock(x)) {
  if (x.antal >= MIN_BARARE_SIDA) return "bärare";
  const t = trend(nyfodda(x.namn));
  if (t && t.forandring >= 0.1 && t.nu >= MIN_NYF_SIDA) return "ökar";
  if (t && t.nu >= MIN_NYF_POPULAR) return "nyfödda";
  if (antalBlock(b) >= MIN_BLOCK) return "datablock";
  return null;
}
// Förkortningar som SCB redovisar som tilltalsnamn men som inte är namn.
const FORKORTNINGAR = new Map([["Md", "Mohammed"], ["Mhd", "Mohammed"]]);
/** De unika datablocken för ett namn utan namnsdag. */
export function datablock(x) {
  const lik = liknande(x.namn, x.huvud?.namn ?? null).map((l) => l.namn);
  const former = sammaNamn(x.namn, lik);
  return {
    scb: (scb(x.namn)?.tilltal ?? 0) > 0, // bärare, kön, placering, medelålder (SCB 2020)
    nyfodda: nyfodda(x.namn).filter((r) => r.x > 0).length >= 3, // utveckling och placering bland nyfödda
    almanacka: !!x.huvud || former.some((f) => f.datum) || delnamn(x.namn).length > 0, // dag att fira
    personer: kandaPersoner(x.namn).length >= 3, // kända bärare (Wikidata)
    betydelse: !!ursprung(x.namn), // ursprung (svenska Wikipedia)
    former: former.length > 0, // samma namn i andra former (Wikidata) med bärare i Sverige
    utland: utlandskaDagar(x.namn).length > 0, // namnsdag i andra länder (Wikidata P1750)
  };
}
export const antalBlock = (b) => Object.values(b).filter(Boolean).length;
/** namn → { mal, skal } för namn utan egen sida. */
export const OMDIRIGERADE = new Map();
for (const x of UTAN_NAMNSDAG) {
  const fork = FORKORTNINGAR.get(x.namn);
  if (fork) { OMDIRIGERADE.set(x.namn, { slug: x.slug, mal: `/namn/${SIDA_AV.get(fork)?.slug}/`, skal: `förkortning av ${fork}` }); continue; }
  const b = datablock(x);
  if (skalForSida(x, b)) continue;
  OMDIRIGERADE.set(x.namn, x.huvud
    ? { slug: x.slug, mal: `/namn/${x.huvud.slug}/`, skal: `${antalBlock(b)} datablock, stavningsvariant av ${x.huvud.namn}` }
    : { slug: x.slug, mal: `/namn-utan-namnsdag/#${x.slug}`, skal: `${antalBlock(b)} datablock` });
}
SIDNAMN = SIDNAMN.filter((x) => !OMDIRIGERADE.has(x.namn));
SIDOR_NAMN = SIDNAMN;
indexera();
SIDA_AV = new Map(SIDNAMN.map((x) => [x.namn, x]));
/** Länk till ett namn utan namnsdag: egen sida, eller dit den omdirigeras. */
export const utanHref = (x) => OMDIRIGERADE.get(x.namn)?.mal ?? `/namn/${x.slug}/`;
/** Har namnet en egen sida? */
export const harEgenSida = (namn) => SIDA_AV.has(namn);
