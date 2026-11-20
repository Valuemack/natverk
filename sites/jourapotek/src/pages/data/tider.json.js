// Kompakt lista för "Öppet nu"-sidan: namn, kommun, adress, koordinater, veckotider, avvikande tider och länk.
import { MED_TIDER, avvikandeFram } from "../../site.js";
export const GET = () => new Response(JSON.stringify(MED_TIDER.filter((a) => a.lat != null).map((a) => {
  const x = avvikandeFram(a);
  return { n: a.namn, k: a.kommun, s: a.kommunSlug, a: a.adress, la: +a.lat.toFixed(5), lo: +a.lon.toFixed(5), t: a.oppettider, ...(Object.keys(x).length && { x }) };
})), { headers: { "Content-Type": "application/json" } });
