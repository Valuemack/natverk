// Kompakt data för sökverktyget och "idag"-rättningen i webbläsaren.
//  dagar: { "mm-dd": [[namn, slug, frånÅr?]] }
//  namn:  [[namn, slug, "mm-dd", frånÅr|0, huvudnamn?]]  (huvudnamn finns för stavningsvarianter; 6:e fältet 1 = saknar namnsdag, firas 1 januari)
//  utan:  { "mm-dd": "Juldagen" }
import { ALLA_NAMN, VARIANTER, UTAN_VARIANT, UTAN_NAMN } from "../../site.js";

export function GET() {
  const dagar = {};
  for (const n of ALLA_NAMN) (dagar[n.datum] ??= []).push([n.namn, n.slug, ...(n.fran ? [n.fran] : [])]);
  const namn = [
    ...ALLA_NAMN.map((n) => [n.namn, n.slug, n.datum, n.fran ?? 0]),
    ...VARIANTER.map((v) => [v.namn, v.slug, v.huvud.datum, v.huvud.fran ?? 0, v.huvud.namn]),
    ...UTAN_VARIANT.map((v) => [v.namn, v.slug, "01-01", 0, 0, 1]),
  ];
  const utan = Object.fromEntries(Object.entries(UTAN_NAMN).map(([k, v]) => [k, v.split(" –")[0]]));
  return new Response(JSON.stringify({ dagar, namn, utan }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
