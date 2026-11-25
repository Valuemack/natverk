// Gemensamt för de långa guidesidorna: lista över guider (hubb, meny, Läs också) och små räknehjälpare.
// Alla siffror räknas ur KAT, alltså samma lekplatsdata som resten av sajten.
import { KAT, utrustning } from "../site.js";
import { FOLKMANGD } from "@natverk/core/folkmangd.js";

export const GUIDER = [
  { href: "/barnkalas/", namn: "Barnkalas på lekplats", text: "Platser, grillplatser, lekar och regler" },
  { href: "/kompisgunga/", namn: "Kompisgunga", text: "Var de finns och vad tillgänglig lek betyder" },
  { href: "/vad-gora-med-barn/", namn: "Vad göra med barn", text: "Utflykter, gratis aktiviteter och regnväder" },
  { href: "/lekplatser-med-vattenlek/", namn: "Plaskdammar och vattenlek", text: "Säsong, hygienregler och alla lekplatser med vatten" },
  { href: "/temalekplatser/", namn: "Temalekplatser och naturlekplatser", text: "Alla teman och var de finns" },
];

export const har = (u) => (e) => !!e.extra?.utrustning?.includes(u);
export const E = KAT.enheter;
export const MED_REDSKAP = E.filter((e) => utrustning(e).length > 0);
export const tal = (n) => n.toLocaleString("sv-SE");
export const procent = (a, b) => `${Math.round((100 * a) / b)} procent`;
export const isTema = (e) => e.typ !== "lekplats" || !!e.extra?.tema;

export const lanEnheter = (l) => l.kommuner.flatMap((k) => k.enheter);
export const folkLan = (l) => l.kommuner.reduce((a, k) => a + (FOLKMANGD[k.namn] ?? 0), 0);
export const FOLK_TOTALT = KAT.kommuner.reduce((a, k) => a + (FOLKMANGD[k.namn] ?? 0), 0);
export const kommun = (namn) => KAT.kommuner.find((k) => k.namn === namn);

/** Räknar per nyckel och sorterar fallande. */
export function rakna(lista, nyckel) {
  const c = new Map();
  for (const e of lista) c.set(nyckel(e), (c.get(nyckel(e)) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "sv"));
}
