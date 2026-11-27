// Underlag för verktyget "Hitta barnnamn": alla namn som minst 10 nyfödda fick under 2018–2022
// (SCB, nyfödda efter tilltalsnamn), med kön, trend och namnsdag.
import { ALLA_NAMN, UTAN_NAMNSDAG } from "../site.js";
import { NYF_ALLA_AR, nyfodda, harEgenSida } from "./namndata.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NYF = JSON.parse(readFileSync(join(process.cwd(), "data", "nyfodda-alla.json"), "utf8"));
const ALM = new Map(ALLA_NAMN.map((n) => [n.namn, n]));
const UTAN = new Map(UTAN_NAMNSDAG.map((x) => [x.namn, x]));
const i18 = NYF_ALLA_AR.indexOf(2018), i13 = NYF_ALLA_AR.indexOf(2013);
const summa = (a, fran, till) => (a ? a.slice(fran, till).reduce((s, x) => s + x, 0) : 0);

/** [{ namn, slug, K, M, fore, trend, datum, typ }] – K/M = flickor/pojkar 2018–2022, fore = alla 2013–2017. */
export const BARNNAMN = Object.entries(NYF.namn).map(([namn, d]) => {
  const K = summa(d.K, i18, i18 + 5), M = summa(d.M, i18, i18 + 5);
  const fore = summa(d.K, i13, i13 + 5) + summa(d.M, i13, i13 + 5);
  const a = ALM.get(namn), u = UTAN.get(namn);
  return {
    namn, K, M, fore,
    trend: fore ? Math.round(((K + M - fore) / fore) * 100) : null,
    slug: harEgenSida(namn) ? (a?.slug ?? u?.slug ?? null) : null,
    datum: a?.datum ?? u?.huvud?.datum ?? null,
    typ: a ? "egen" : u?.huvud ? "variant" : null,
  };
}).filter((x) => x.K + x.M >= 10 && !x.namn.includes(" ")).sort((a, b) => b.K + b.M - (a.K + a.M));

export { nyfodda };
