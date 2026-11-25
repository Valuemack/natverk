// Gemensamma uträkningar för de långa guidesidorna. All data kommer från pollenkalendern
// (bearbetning av NRM:s uppmätta dygnsvärden, se site.js). Inga egna antaganden om halter.
import { REGIONER, TYPER, KALENDER_AR, kalenderFor, SASONG_PAGAR, UPPDATERAD, mmdd } from "../site.js";

export const PUBLICERAD = "2026-11-25";
/** Typsidorna visar dagens prognos i säsong (ändras dagligen); utanför säsong ändras inget förrän nästa vår. */
export const TYP_UPPDATERAD = SASONG_PAGAR ? UPPDATERAD : PUBLICERAD;
export const AR_TEXT = KALENDER_AR.length ? `${KALENDER_AR[0]}–${KALENDER_AR.at(-1)}` : "";

export const typ = (slug) => TYPER.find((t) => t.slug === slug);
/** Mätorterna från söder till norr. */
export const SODER_NORR = [...REGIONER].reverse();

/** "MM-DD" → dag på året (vanligt år), för jämförelser och skillnader i dagar. */
const MDAGAR = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const doy = (s) => (s ? MDAGAR[+s.slice(0, 2) - 1] + +s.slice(3, 5) : null);
export const dagarMellan = (a, b) => (a && b ? doy(b) - doy(a) : null);

/** Kalenderrader för ett pollenslag, söder → norr, bara orter med data. */
export const rader = (t) => SODER_NORR.map((r) => ({ r, k: kalenderFor(r, t) })).filter((x) => x.k);

/** Årssumma (summan av dygnsvärden under säsongen) per ort och år. */
export const arSumma = (k, ar) => k.ar.find((a) => a.ar === ar)?.summa ?? null;

/** Median av tal. */
export const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
/** Median av "MM-DD"-strängar. */
export const medianDag = (a) => { const s = a.filter(Boolean).sort(); return s.length ? s[s.length >> 1] : null; };

/** Tidigaste och senaste typiska säsongsstart bland orterna. */
export const ytterlagen = (rad) => {
  const s = [...rad].sort((a, b) => a.k.typisk_start.localeCompare(b.k.typisk_start));
  return { forst: s[0], sist: s.at(-1) };
};

export const tal = (n) => (n == null ? "–" : Number(n).toLocaleString("sv-SE"));
export const dagText = (n) => `${n} ${n === 1 ? "dag" : "dagar"}`;
export { mmdd };
