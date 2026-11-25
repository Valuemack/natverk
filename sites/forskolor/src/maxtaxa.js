// Maxtaxa för förskola och fritidshem (förordningen 2001:160 om statsbidrag för maxtaxa).
// Från 1 juli 2026: den del av inkomsten som understiger 10 001 kr räknas inte (fribelopp 10 000 kr), 5 § i lydelse SFS 2026:3.
// Skolverket fastställer inkomsttaket för nästa år senast 1 december (5 a §).
// Källor: Skolverket, "Statsbidrag för maxtaxa 2026" (uppd. 2026-09-10) och "Statsbidrag för maxtaxa 2027" (uppd. 2026-11-23).
export const MAXTAXA = [
  {
    id: "2026-07",
    rubrik: "från 1 juli 2026",
    ar: 2026,
    giltigFran: "2026-07-01",
    fribelopp: 10000,
    takEfterAvdrag: 51560,
    // Andel av inkomsten efter fribeloppet, per barn (yngsta barnet = barn 1). Barn 4 och fler: ingen avgift.
    forskola: [0.03, 0.02, 0.01],
    fritidshem: [0.02, 0.01, 0.01],
  },
  {
    id: "2027",
    rubrik: "2027",
    ar: 2027,
    giltigFran: "2027-01-01",
    fribelopp: 10000,
    takEfterAvdrag: 53920,
    forskola: [0.03, 0.02, 0.01],
    fritidshem: [0.02, 0.01, 0.01],
    publicerad: "2026-11-23",
  },
];

/** Senast inlagda nivå (den som rubriker och titel utgår från). */
export const AKTUELL = MAXTAXA.at(-1);
export const NASTA_AR = 2027;
/** true när Skolverkets siffror för NASTA_AR är inlagda ovan. */
export const NASTA_PUBLICERAD = MAXTAXA.some((m) => m.giltigFran.startsWith(String(NASTA_AR)));
/** Nivån som gäller ett visst datum (Date eller "YYYY-MM-DD"). */
export const gallerVid = (d) => {
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return [...MAXTAXA].reverse().find((m) => m.giltigFran <= s) ?? MAXTAXA[0];
};

/** Högsta avgift i kronor per månad (avrundat som Skolverket anger, till hela kronor). */
export const maxAvgift = (m, typ, nr) => (nr > 3 ? 0 : Math.round(m.takEfterAvdrag * m[typ][nr - 1]));

/** Avgift per månad för ett barn givet hushållets inkomst före skatt per månad. */
export function avgift(m, inkomst, typ, nr) {
  if (nr > 3) return 0;
  const grund = Math.min(Math.max(0, inkomst - m.fribelopp), m.takEfterAvdrag);
  return Math.round(grund * m[typ][nr - 1]);
}
