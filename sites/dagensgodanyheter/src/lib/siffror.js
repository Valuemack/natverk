// "Världen i siffror": en belagd datapunkt per dag om hur världen blivit bättre, med källa.
// Datan ligger i data/varlden-i-siffror.json och är kontrollerad mot källan (OWID, Gapminder, FN-organ, SCB m.fl.).
// Varje dag visas nästa punkt i listan, så att samma siffra inte står kvar.
import { NU, isoDag } from "./artiklar.js";

const filer = import.meta.glob("../../data/varlden-i-siffror.json", { eager: true, import: "default" });
export const SIFFROR = (Object.values(filer)[0]?.punkter ?? []).filter((p) => p && p.siffra && p.text && p.kalla?.url);

export function dagensSiffra(d = NU, forskjut = 0) {
  if (!SIFFROR.length) return null;
  const dag = Math.floor(Date.parse(isoDag(d)) / 864e5);
  return SIFFROR[(((dag + forskjut) % SIFFROR.length) + SIFFROR.length) % SIFFROR.length];
}
