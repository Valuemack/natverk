// Flygplatser med terminalens läge. Datakällan märker allt inom 3 km från en flygplats som
// flygplatsparkering, vilket fångar skolor och sjukhus (Bromma). Vi godtar bara parkeringar
// inom en radie (1,5 km, större för Arlanda, Landvetter och Skavsta) och utan namn som tydligt hör till något annat.
export const FLYGPLATSER = {
  "Stockholm Arlanda Airport": { namn: "Arlanda", lat: 59.6498, lon: 17.9305, radie: 3.5, swedavia: true },
  "Bromma Stockholm Airport": { namn: "Bromma", lat: 59.3544, lon: 17.9417, swedavia: true },
  "Göteborg Landvetter Airport": { namn: "Landvetter", lat: 57.6685, lon: 12.2925, radie: 2.5, swedavia: true },
  "Malmö Airport": { namn: "Malmö Airport (Sturup)", lat: 55.5383, lon: 13.3717, swedavia: true },
  "Umeå Airport": { namn: "Umeå Airport", lat: 63.7918, lon: 20.2828, swedavia: true },
  "Stockholm Skavsta Airport": { namn: "Skavsta", lat: 58.7886, lon: 16.9122, radie: 2.5 },
  "Sundsvall Timrå Airport": { namn: "Sundsvall Timrå Airport", lat: 62.5281, lon: 17.4439 },
};
const INTE_FLYG = /gymnasi|sjukhus|skola|kyrk|gården|gourmet|restaurang/i;
const km = (a, b, c, d) => {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return 6371 * Math.hypot(x, y);
};
/** Den flygplats parkeringen faktiskt hör till, eller null. */
export function flygplatsFor(e) {
  const f = e.extra?.flygplats;
  if (!f) return null;
  const p = FLYGPLATSER[f];
  if (INTE_FLYG.test(e.namn ?? "")) return null;
  if (!p) return f; // små flygplatser utan känt läge: behåll källans märkning
  return e.lat != null && km(e.lat, e.lon, p.lat, p.lon) <= (p.radie ?? 1.5) ? f : null;
}
