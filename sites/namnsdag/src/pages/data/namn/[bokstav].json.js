// Sökdata för /hur-manga-heter/, uppdelad per begynnelsebokstav så att webbläsaren bara hämtar en liten fil.
//  { "Anna": [tilltalK2020, tilltalM2020, förnamnK2020, förnamnM2020, tilltal2000, placering2020] }
// Källa: SCB BE0001TNamn10 och BE0001FNamn10 (CC0), namn med minst 10 bärare.
import { ALLA_SCB } from "../../../lib/statistik.js";

export const nyckel = (namn) => {
  const c = namn[0].toLowerCase();
  return c === "å" ? "aa" : c === "ä" ? "ae" : c === "ö" ? "oe" : /[a-z]/.test(c) ? c : "ovr";
};

const rang = Object.entries(ALLA_SCB).map(([n, a]) => [n, a[0] + a[1]]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
const plats = new Map(rang.map(([n], i) => [n, i + 1]));
const DELAR = {};
for (const [n, a] of Object.entries(ALLA_SCB)) (DELAR[nyckel(n)] ??= {})[n] = [...a, plats.get(n) ?? 0];

export function getStaticPaths() {
  return Object.keys(DELAR).map((bokstav) => ({ params: { bokstav } }));
}

export function GET({ params }) {
  return new Response(JSON.stringify(DELAR[params.bokstav]), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
