// Maxtaxa för förskola och fritidshem (förordningen om statsbidrag för maxtaxa).
// Från 1 juli 2026: fribelopp 10 000 kr dras av från hushållets avgiftsgrundande inkomst.
// Skolverket fastställer inkomsttaket för nästa år senast 1 december – lägg då in 2027 här.
// Källor: Regeringens pressmeddelande 2026-01-21 och kommunernas avgiftstabeller (t.ex. Malmö stad).
export const MAXTAXA = [
  {
    id: "2026-07",
    rubrik: "från 1 juli 2026",
    giltigFran: "2026-07-01",
    fribelopp: 10000,
    takEfterAvdrag: 51560,
    // Andel av inkomsten efter fribeloppet, per barn (yngsta barnet = barn 1). Barn 4 och fler: ingen avgift.
    forskola: [0.03, 0.02, 0.01],
    fritidshem: [0.02, 0.01, 0.01],
  },
];

export const AKTUELL = MAXTAXA.at(-1);
export const NASTA_AR = 2027;
/** true när Skolverkets siffror för NASTA_AR är inlagda ovan. */
export const NASTA_PUBLICERAD = MAXTAXA.some((m) => m.giltigFran.startsWith(String(NASTA_AR)));

/** Högsta avgift i kronor per månad (avrundat som kommunerna gör, till hela kronor). */
export const maxAvgift = (m, typ, nr) => (nr > 3 ? 0 : Math.round(m.takEfterAvdrag * m[typ][nr - 1]));

/** Avgift per månad för ett barn givet hushållets inkomst före skatt per månad. */
export function avgift(m, inkomst, typ, nr) {
  if (nr > 3) return 0;
  const grund = Math.min(Math.max(0, inkomst - m.fribelopp), m.takEfterAvdrag);
  return Math.round(grund * m[typ][nr - 1]);
}
