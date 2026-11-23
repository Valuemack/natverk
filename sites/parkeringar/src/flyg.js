// Parkering vid flygplatser: grupperat på flygplatsFor() (källans märkning plus avståndskontroll).
import { slug } from "@natverk/core/katalog.js";
import { KAT } from "./site.js";
import { FLYGPLATSER, flygplatsFor } from "./flygplatser.js";

export const FLYG = Object.entries(FLYGPLATSER)
  .map(([fullt, p]) => ({ fullt, ...p, slug: slug(p.namn.replace(/\(.*\)/, "")), enheter: KAT.enheter.filter((e) => flygplatsFor(e) === fullt) }))
  .filter((f) => f.enheter.length >= 2)
  .sort((a, b) => b.enheter.length - a.enheter.length)
  .map((f) => ({ ...f, href: `/flygplatsparkering/${f.slug}/` }));
