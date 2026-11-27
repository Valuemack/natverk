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
const SIDNAMN = [
  ...ALLA_NAMN.filter((n) => !SAMMANSLAGNA.has(n.namn)).map((n) => ({ namn: n.namn, slug: n.slug, datum: n.datum, fran: n.fran ?? null, typ: "namn" })),
  ...UTAN_NAMNSDAG.map((x) => ({ namn: x.namn, slug: x.slug, datum: x.huvud?.datum ?? null, huvud: x.huvud?.namn ?? null, typ: x.huvud ? "variant" : "utan" })),
];
const PER_NYCKEL = new Map();
const PER_WIKI = new Map();
for (const s of SIDNAMN) {
  const k = stavNyckel(s.namn);
  (PER_NYCKEL.get(k) ?? PER_NYCKEL.set(k, []).get(k)).push(s);
  const w = WIKI.namn[s.namn]?.titel;
  if (w) (PER_WIKI.get(w) ?? PER_WIKI.set(w, []).get(w)).push(s);
}
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
export const SIDOR_NAMN = SIDNAMN;

/** 5–8 kända personer: upp till fem svenska, resten de mest omskrivna, ordnade efter antal språkversioner. */
export function kandaPersoner(namn, max = 8) {
  const alla = personer(namn);
  const sv = alla.filter((p) => /svensk/i.test(p.beskr ?? "")).slice(0, 5);
  const ovr = alla.filter((p) => !sv.includes(p));
  return [...sv, ...ovr].slice(0, max).sort((a, b) => (b.sprak ?? 0) - (a.sprak ?? 0));
}
