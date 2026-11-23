// Samlingssidor för apotek: per kedja och per butikstyp (apotek inne i ICA Maxi, Kvantum …).
// Folk söker "apoteket ica maxi", "kronans apotek öppettider" – de här sidorna svarar på det.
import { slug, DAGAR, tolkaIntervall } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";

const E = KAT.enheter;

export const BUTIKER = [
  { slug: "ica-maxi", namn: "ICA Maxi", re: /ica maxi/i },
  { slug: "ica-kvantum", namn: "ICA Kvantum", re: /kvantum/i },
  { slug: "ica-supermarket", namn: "ICA Supermarket", re: /ica supermarket/i },
  { slug: "vardcentral", namn: "vårdcentral", re: /vårdcentral|hälsocentral/i, rubrik: "Apotek på vårdcentralen" },
].map((b) => ({ ...b, rubrik: b.rubrik ?? `Apotek på ${b.namn}`, href: `/apotek-pa/${b.slug}/`, enheter: E.filter((e) => b.re.test(e.namn)) })).filter((b) => b.enheter.length >= 10);

export const KEDJOR = [...new Set(E.map((e) => e.kedja).filter((k) => k && k !== "Fristående"))]
  .map((k) => ({ namn: k, slug: slug(k), rubrik: k, href: `/kedja/${slug(k)}/`, enheter: E.filter((e) => e.kedja === k) }))
  .filter((k) => k.enheter.length >= 10)
  .sort((a, b) => b.enheter.length - a.enheter.length);

/** Senaste stängning en dag (minuter), null om okänt. */
export const stangerDag = (e, d) => { const iv = tolkaIntervall(e.oppettider?.[d]); return iv === null ? null : iv.length ? Math.max(...iv.map(([, b]) => b)) : 0; };
export const kl = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}.${String(m % 60).padStart(2, "0")}`.replace(/\.00$/, "");

/** Nyckeltal för en grupp apotek. */
export function nyckeltal(enheter) {
  const medTider = enheter.filter((e) => DAGAR.some((d) => tolkaIntervall(e.oppettider?.[d]) !== null));
  const sondag = medTider.filter((e) => (stangerDag(e, "sun") ?? 0) > 0);
  const lordag = medTider.filter((e) => (stangerDag(e, "sat") ?? 0) > 0);
  const sent = medTider.filter((e) => DAGAR.slice(0, 5).some((d) => (stangerDag(e, d) ?? 0) >= 21 * 60));
  const senast = [...medTider].sort((a, b) => Math.max(...DAGAR.map((d) => stangerDag(b, d) ?? 0)) - Math.max(...DAGAR.map((d) => stangerDag(a, d) ?? 0)))[0];
  const kommuner = new Set(enheter.map((e) => e.kommun)).size;
  return { medTider, sondag, lordag, sent, senast, kommuner };
}
