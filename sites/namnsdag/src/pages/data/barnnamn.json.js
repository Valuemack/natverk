// Kompakt data för /hitta-barnnamn/: [namn, slug|"", flickor 2018–22, pojkar 2018–22, trend % | null, namnsdag mm-dd|"", variant 0/1]
import { BARNNAMN } from "../../lib/barnnamn.js";

export function GET() {
  const rader = BARNNAMN.map((x) => [x.namn, x.slug ?? "", x.K, x.M, x.trend, x.datum ?? "", x.typ === "variant" ? 1 : 0]);
  return new Response(JSON.stringify(rader), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
