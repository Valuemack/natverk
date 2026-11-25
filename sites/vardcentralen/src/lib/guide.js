// Gemensamma hjälpare för de långa guidesidorna. Data:
//   data/guidedata.json  – från scripts/07-guidedata.mjs (närakut/jour, e-tjänster i 1177-korten, patientenkät)
//   data/vardtyper.json  – från scripts/06-fetch-1177-vardtyper.mjs (MVC, BVC, provtagning m.m. per län/kommun)
import G from "../../data/guidedata.json";
import V from "../../data/vardtyper.json";
import { talText } from "@natverk/core/katalog.js";
import { KAT } from "../site.js";

export { G, V };
export const PUBLICERAD = "2026-11-25";
/** Datum då ögonblicksbilderna i guidedata/vardtyper togs fram (inte byggdagen). */
export const DATA_DATUM = "2026-11-25";
export const tal = (n) => talText(n);
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const komma = (x, d = 1) => x.toFixed(d).replace(".", ",");
/** Invånare per enhet, avrundat till tusental. */
export const invPer = (folk, n) => (folk && n ? tal(Math.round(folk / n / 1000) * 1000) : "–");
export const kort = (lan) => lan.replace(/ län$/, "");

/** Rader per län (alla 21) med länets sida, folkmängd och antal vårdcentraler i katalogen. */
export function lanRader(fn) {
  return KAT.lan.map((l) => ({ l, namn: l.namn, kortnamn: kort(l.namn), href: l.href, folk: l.folk, vc: l.antal, ...fn(l.namn, l) }));
}
/** Antal mottagningar av en 1177-vårdtyp per län. */
export const vardtyp = (typ) => V.typer[typ];
export const vardtypLan = (typ, lan) => V.typer[typ]?.perLan?.[lan] ?? 0;
/** Kommuner (namn + länk) med flest mottagningar av en vårdtyp. */
export function toppKommuner(typ, n = 12) {
  const per = V.typer[typ]?.perKommun ?? {};
  const kommunPerKod = new Map(KAT.kommuner.map((k) => [k.enheter[0]?.extra?.kommunkod, k]));
  return Object.entries(per).map(([kod, antal]) => ({ k: kommunPerKod.get(kod), antal })).filter((x) => x.k)
    .sort((a, b) => b.antal - a.antal || a.k.namn.localeCompare(b.k.namn, "sv")).slice(0, n);
}
export const KALLA_1177_VARDTYP = (typ) => ({
  namn: `1177 Hitta vård – vårdtyp ${typ}`,
  url: `https://www.1177.se/hitta-vard/?caretype=${encodeURIComponent(typ)}&s=name&region=00`,
  text: "antal mottagningar per län, sammanställt av redaktionen",
  datum: DATA_DATUM,
});
