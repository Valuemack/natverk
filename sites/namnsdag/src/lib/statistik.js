// Gemensam namnstatistik för guidesidorna (SCB, CC0). Läses bara vid bygget.
// Läses med fs i stället för import så att Vite inte buntar in de stora filerna i varje sida.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const las = (f) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const TOPP = las("scb-topp.json");
const ALLA = las("scb-alla.json");
import { ALLA_NAMN, UTAN_NAMNSDAG } from "../site.js";

export const TOPP_KALLA = TOPP.kalla;
export const ALLA_KALLA = ALLA.kalla;
/** Nyfödda topp 100 per år: NYFODDA.M["2022"] = [[namn, antal], …] (SCB har slagit ihop liknande stavningar). */
export const NYFODDA = TOPP.nyfodda;
/** Folkbokförda topp 100 per år (1999–2021), liknande stavningar sammanslagna. */
export const BEFOLKNING = TOPP.befolkning;
export const MEDELALDER = TOPP.medelalder2020;
/** Alla tilltals- och förnamn 2020: [tilltalK, tilltalM, förnamnK, förnamnM, tilltal2000] */
export const ALLA_SCB = ALLA.namn;

export const NYF_AR = Object.keys(NYFODDA.M).map(Number).sort((a, b) => a - b);
export const NYF_SENAST = NYF_AR.at(-1);
export const BEF_SENAST = Math.max(...Object.keys(BEFOLKNING.M).map(Number));

const ALM = new Map(ALLA_NAMN.map((n) => [n.namn, n]));
/** Almanacksnamnet om namnet finns i namnlängden (eller är en registrerad variant, t.ex. Noah → Noa). */
export const almanacka = (namn) => ALM.get(namn) ?? ALLA_NAMN.find((n) => n.varianter?.includes(namn)) ?? null;

/** Placering för ett namn i ett års topplista (1-baserad), eller null. */
export const placering = (lista, namn) => { const i = lista.findIndex(([n]) => n === namn); return i < 0 ? null : i + 1; };

/** Antal år ett namn legat etta i nyföddalistan för ett kön. */
export function ettor(kon) {
  const r = {};
  for (const ar of NYF_AR) { const n = NYFODDA[kon][ar][0][0]; (r[n] ??= []).push(ar); }
  return Object.entries(r).map(([namn, ar]) => ({ namn, ar })).sort((a, b) => a.ar[0] - b.ar[0]);
}

/** Tilltalsnamn 2020 för ett kön, sorterade efter antal: [{ namn, antal, ar2000 }] */
export function tilltal(kon) {
  const i = kon === "K" ? 0 : 1;
  return Object.entries(ALLA_SCB)
    .filter(([, a]) => a[i] > 0 && a[i] >= a[1 - i])
    .map(([namn, a]) => ({ namn, antal: a[i], ar2000: a[4] }))
    .sort((a, b) => b.antal - a.antal);
}

/** Antal pojkar/flickor som fick namnet varje år (0 om namnet inte var bland topp 100). */
export const serie = (kon, namn) => NYF_AR.map((ar) => ({ ar, x: NYFODDA[kon][ar].find(([n]) => n === namn)?.[1] ?? 0 }));

/** Namn i topp 100 under ett år men inte under ett annat (nykomlingar). */
export const nykomlingar = (kon, fran, till) => {
  const fore = new Set(NYFODDA[kon][fran].map(([n]) => n));
  return NYFODDA[kon][till].filter(([n]) => !fore.has(n));
};

// Isof "Förnamn" (uppdaterad 13 nov 2025) och Skatteverket "Namn på nyfödda" – lästa 2026-11-25.
export const NYARE = {
  2023: { K: ["Vera", "Elsa", "Alma"], M: ["Noah", "Hugo", "Walter"], kalla: "Isof" },
  2025: { K: ["Vera", "Astrid", "Alice", "Olivia", "Elsa"], M: ["Noah", "Hugo", "Liam", "Nils", "Alfred"], kalla: "Skatteverket" },
};

/** Namnsdag för ett namn: egen dag, stavningsvariant (kan firas på huvudnamnets dag), utan (egen sida, 1 januari) eller null. */
export function namnsdagFor(namn) {
  const a = almanacka(namn);
  if (a) return { typ: "egen", n: a, slug: a.slug };
  const v = UTAN_NAMNSDAG.find((x) => x.namn === namn);
  if (!v) return null;
  return v.huvud ? { typ: "variant", n: v.huvud, slug: v.slug } : { typ: "utan", n: { namn, datum: "01-01" }, slug: v.slug };
}
