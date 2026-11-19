// Datumhjälpare för alla sajter i nätverket. Alla datum hanteras som UTC-midnatt
// (rena kalenderdatum utan tidszon), så att inga sommartidsfel uppstår.

export const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli",
  "augusti", "september", "oktober", "november", "december"];
export const VECKODAGAR = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export const datum = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
export const plusDagar = (dt, n) => new Date(dt.getTime() + n * 86400000);
export const iso = (dt) => dt.toISOString().slice(0, 10);
export const franIso = (s) => { const [y, m, d] = s.split("-").map(Number); return datum(y, m, d); };
export const veckodag = (dt) => VECKODAGAR[dt.getUTCDay()];
export const arHelg = (dt) => dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
export const dagarMellan = (a, b) => Math.round((b - a) / 86400000);

/** "28 mars" */
export const kort = (dt) => `${dt.getUTCDate()} ${MANADER[dt.getUTCMonth()]}`;
/** "söndag 28 mars 2027" */
export const lang = (dt) => `${veckodag(dt)} ${kort(dt)} ${dt.getUTCFullYear()}`;
export const versal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** ISO 8601-veckonummer (som används i Sverige). Returnerar { ar, vecka }. */
export function isoVecka(dt) {
  const d = new Date(dt.getTime());
  const dag = d.getUTCDay() || 7; // måndag=1 … söndag=7
  d.setUTCDate(d.getUTCDate() + 4 - dag); // torsdagen i samma vecka avgör året
  const ar = d.getUTCFullYear();
  const vecka = Math.ceil(((d - Date.UTC(ar, 0, 1)) / 86400000 + 1) / 7);
  return { ar, vecka };
}

/** Antal ISO-veckor ett år har (52 eller 53). */
export const veckorIAr = (ar) => isoVecka(datum(ar, 12, 28)).vecka;

/** Måndagen i en given ISO-vecka. */
export function mandagIVecka(ar, vecka) {
  const jan4 = datum(ar, 1, 4);
  const dag = jan4.getUTCDay() || 7;
  return plusDagar(jan4, (vecka - 1) * 7 - (dag - 1));
}

/** Dagens datum i Stockholm. BYGGDATUM=YYYY-MM-DD kan sättas för test. */
export function idagStockholm() {
  if (process.env.BYGGDATUM) return franIso(process.env.BYGGDATUM);
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return franIso(s);
}
