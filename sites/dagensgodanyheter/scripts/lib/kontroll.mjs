// Maskinella kontroller av en skriven artikel innan faktagranskningen. Används av skriv.mjs och testerna.
import { KAT_SLUGS } from "../../src/lib/kategorier.js";

const ordAv = (t) => String(t).split(/\s+/).filter(Boolean);

/** Antal ord i brödtexten: ingress, mellanrubriker, stycken och "Varför det spelar roll". */
export function antalOrd(a) {
  return ordAv([a.ingress, ...a.avsnitt.flatMap((s) => [s.rubrik, ...s.stycken]), a.varfor].join(" ")).length;
}

const norm = (t) => String(t).toLowerCase().replace(/[^a-zåäöéü0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Uppmaningar till läsaren. "köp"/"sälj" ensamma ger för många falska träffar (t.ex. "köpt", nyhetsfakta),
// så bara tydliga rådsformuleringar fångas här; faktagranskaren gör den riktiga bedömningen.
const RAD = /\b(du bör|du ska|du borde|rekommenderar vi|vi rekommenderar|investera i|köp aktier|sälj aktier|sluta ta|börja ta)\b/i;

/** Returnerar en lista med fel. Tom lista = godkänd i maskinkontrollen. */
export function maskinkontroll(a, kalltext) {
  const fel = [];
  const ord = antalOrd(a);
  if (ord < 300 || ord > 700) fel.push(`längd ${ord} ord (ska vara 300–700)`);
  if (a.avsnitt.length < 2) fel.push("färre än två H2-avsnitt");
  if ((a.faktaruta?.punkter?.length ?? 0) < 3) fel.push("faktarutan har färre än tre punkter");
  if (!a.varfor || ordAv(a.varfor).length < 15) fel.push("'Varför det spelar roll' saknas eller är för kort");
  if (!/^[a-z0-9-]{8,80}$/.test(a.slug)) fel.push("ogiltig slug");
  if (!KAT_SLUGS.includes(a.kategori)) fel.push("okänd kategori");
  const hela = [a.rubrik, a.ingress, ...a.avsnitt.flatMap((s) => s.stycken), ...(a.faktaruta?.punkter ?? []), a.varfor].join("\n");
  // Citat: allt inom citattecken måste stå ordagrant i källan.
  const kallNorm = norm(kalltext);
  for (const m of hela.matchAll(/[”"“«]([^”"“»]{12,})[”"»]/g)) if (!kallNorm.includes(norm(m[1]))) fel.push(`citat som inte finns i källan: ${m[1].slice(0, 60)}`);
  // Kopierad text: en följd av tio ord som står likadant i källan.
  const kallOrd = kallNorm.split(" ");
  const tioOrd = new Set();
  for (let i = 0; i + 10 <= kallOrd.length; i++) tioOrd.add(kallOrd.slice(i, i + 10).join(" "));
  const artOrd = norm(hela).split(" ");
  for (let i = 0; i + 10 <= artOrd.length; i++) if (tioOrd.has(artOrd.slice(i, i + 10).join(" "))) { fel.push("tio ord i följd är kopierade från källan"); break; }
  if (RAD.test(hela)) fel.push("innehåller råd till läsaren");
  return fel;
}

export const KOPIERAT = "tio ord i följd är kopierade från källan";

/** De ordföljder (minst tio ord) i artikeln som står likadant i källan, utökade till hela den kopierade sträckan. */
export function kopieradeFraser(a, kalltext) {
  const kallOrd = norm(kalltext).split(" ");
  const tioOrd = new Set();
  for (let i = 0; i + 10 <= kallOrd.length; i++) tioOrd.add(kallOrd.slice(i, i + 10).join(" "));
  const hela = [a.rubrik, a.ingress, ...a.avsnitt.flatMap((s) => s.stycken), ...(a.faktaruta?.punkter ?? []), a.varfor].join("\n");
  const artOrd = norm(hela).split(" ");
  const fraser = [];
  for (let i = 0; i + 10 <= artOrd.length; i++) {
    if (!tioOrd.has(artOrd.slice(i, i + 10).join(" "))) continue;
    let j = i + 10;
    while (j < artOrd.length && tioOrd.has(artOrd.slice(j - 9, j + 1).join(" "))) j++;
    fraser.push(artOrd.slice(i, j).join(" "));
    i = j - 1;
  }
  return fraser;
}
