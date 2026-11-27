// Kompakt data för sökverktyget och "idag"-rättningen i webbläsaren.
//  dagar: { "mm-dd": [[namn, slug, frånÅr?]] }
//  namn:  [[namn, slug, "mm-dd", frånÅr|0, huvudnamn?, utan?, mål?]]  (huvudnamn finns för stavningsvarianter; 6:e fältet 1 = saknar namnsdag, firas 1 januari;
//         7:e fältet = adress när namnet saknar egen sida och 301-omdirigeras)
//  utan:  { "mm-dd": "Juldagen" }
import { ALLA_NAMN, VARIANTER, UTAN_VARIANT, UTAN_NAMN, SAMMANSLAGNA, dagHref } from "../../site.js";
import { OMDIRIGERADE } from "../../lib/namndata.js";
const mal = (namn) => OMDIRIGERADE.get(namn)?.mal ?? (SAMMANSLAGNA.has(namn) ? dagHref(SAMMANSLAGNA.get(namn)) : null);

export function GET() {
  const dagar = {};
  for (const n of ALLA_NAMN) (dagar[n.datum] ??= []).push([n.namn, n.slug, ...(n.fran ? [n.fran] : [])]);
  const namn = [
    ...ALLA_NAMN.map((n) => (mal(n.namn) ? [n.namn, n.slug, n.datum, n.fran ?? 0, 0, 0, mal(n.namn)] : [n.namn, n.slug, n.datum, n.fran ?? 0])),
    ...VARIANTER.map((v) => [v.namn, v.slug, v.huvud.datum, v.huvud.fran ?? 0, v.huvud.namn, ...(mal(v.namn) ? [0, mal(v.namn)] : [])]),
    ...UTAN_VARIANT.map((v) => [v.namn, v.slug, "01-01", 0, 0, 1, ...(mal(v.namn) ? [mal(v.namn)] : [])]),
  ];
  const utan = Object.fromEntries(Object.entries(UTAN_NAMN).map(([k, v]) => [k, v.split(" –")[0]]));
  return new Response(JSON.stringify({ dagar, namn, utan }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
