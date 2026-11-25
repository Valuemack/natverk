// Gemensamt för de långa guiderna: lista över guider (hubb, meny, llms.txt) och hjälpfunktioner
// för Skolverkets kommunala jämförelsetal (nyckel per kommun via statFor).
import { KAT, RIKET, statFor } from "./site.js";

export const GUIDER = [
  { href: "/forskollarare/", namn: "Förskollärare och barnskötare", text: "Legitimation, utbildning och andel förskollärare i varje kommun" },
  { href: "/forskoleklass/", namn: "Förskoleklass och fritidshem", text: "Skolstart, fritids till 13 år och den tioåriga grundskolan" },
  { href: "/lpfo-18/", namn: "Läroplanen Lpfö 18", text: "Vad läroplanen säger, ändringarna 2025 och målen i siffror" },
  { href: "/maxtaxa/", namn: "Maxtaxa 2027", text: "Räkna ut avgiften för förskola och fritidshem" },
  { href: "/forskoleplats/", namn: "Förskoleplats", text: "Ansöka, kö, byta och säga upp – med datumräknare" },
  { href: "/kommunal-eller-fristaende/", namn: "Kommunal eller fristående förskola", text: "Skillnader, föräldrakooperativ och inriktningar" },
  { href: "/pedagogisk-omsorg/", namn: "Pedagogisk omsorg och nattis", text: "Dagbarnvårdare, familjedaghem och omsorg på obekväm tid" },
  { href: "/allman-forskola/", namn: "Allmän förskola och 15 timmar", text: "525 timmar från tre år och rätten vid föräldraledighet" },
  { href: "/inskolning/", namn: "Inskolning på förskolan", text: "Upplägg, föräldraledighet och planering" },
  { href: "/packlista/", namn: "Packlista för förskolan", text: "Vad barnet behöver – med utskrivbar checklista" },
];
export const guide = (href) => GUIDER.find((g) => g.href === href);
/** 3–6 relaterade guider till en sida (exkluderar sidan själv). */
export const relaterade = (...hrefs) => hrefs.map(guide).filter(Boolean);

export const tal = (v, d = 1) => (v == null ? "–" : Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const pct = (v, d = 0) => (v == null ? "–" : `${tal(v, d)} %`);
export const heltal = (v) => (v == null ? "–" : Math.round(v).toLocaleString("sv-SE"));

/** Alla kommuner med jämförelsetal: [{ k, s }] */
export const KOMMUNSTAT = KAT.kommuner.map((k) => ({ k, s: statFor(k) })).filter((x) => x.s);
export const STAT_AR = RIKET?.ar ?? KOMMUNSTAT[0]?.s.ar;

/** Sortera kommuner på ett fält. hog = högst först. Filtrerar bort saknade värden. */
export function rangordna(falt, hog = true, min = {}) {
  return KOMMUNSTAT.filter((x) => x.s[falt] != null && Object.entries(min).every(([f, v]) => (x.s[f] ?? 0) >= v))
    .sort((a, b) => (hog ? b.s[falt] - a.s[falt] : a.s[falt] - b.s[falt]));
}

/** Medelvärde per län, viktat med antal inskrivna barn. */
export function perLan(falt) {
  return KAT.lan.map((l) => {
    const rader = KOMMUNSTAT.filter((x) => x.k.lanSlug === l.slug && x.s[falt] != null && x.s.barn_inskrivna);
    const vikt = rader.reduce((a, x) => a + x.s.barn_inskrivna, 0);
    const v = vikt ? rader.reduce((a, x) => a + x.s[falt] * x.s.barn_inskrivna, 0) / vikt : null;
    return { lan: l, v, n: rader.length, barn: vikt };
  }).filter((x) => x.v != null);
}

/** Skolverkets riktmärke för barngruppernas storlek (Allmänna råd 2017, återgivet i PM Barn och personal i förskola 2025). */
export const RIKTMARKE = { yngre: [6, 12], aldre: [9, 15] };

export const SKOLVERKET_PM_2025 = {
  namn: "Skolverket – PM Barn och personal i förskola 2025",
  url: "https://www.skolverket.se/sok-publikationer/publikationsserier/beskrivande-statistik/2026/barn-och-personal-i-forskola---hosten-2025",
  text: "riksstatistik med mätdatum hösten 2025, publicerad 16 april 2026",
  datum: "2026-11-25",
};
export const SKOLVERKET_JMF = {
  namn: "Skolverkets statistikdatabas – kommunala jämförelsetal",
  url: "https://statistikdatabasen.skolverket.se/PxWeb/pxweb/sv/Skolverkets_statistikdatabas/",
  text: "barngrupper, personal och huvudmän per kommun, som sajten hämtar varje natt",
  datum: "2026-11-19",
};
export const SKOLLAGEN = {
  namn: "Skollag (2010:800), ändrad t.o.m. SFS 2026:1636",
  url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/",
  datum: "2026-11-25",
};
