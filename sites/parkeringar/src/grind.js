// Kvalitetsgrind för parkeringar.nu (beslut 2026-11-27, se BYGGLOGG.md och SEO-playbook §0).
// Inga tunna sidor: en sida som inte klarar grinden byggs inte. Dess gamla URL 301-omdirigeras till föräldersidan
// (scripts/omdirigeringar.mjs), och parkeringen finns kvar som rad med ankare där.
//
// PARKERINGSSIDA (/<kommun>/<parkering>/) byggs bara om ALLA fyra villkoren gäller:
//   1. Öppen för besökare: inte "endast uthyrning", inte förhyrd plats, inte en taxa som bara gäller laddning för hyresgäster.
//   2. Går att söka på: ett eget namn (inte bara en gatuadress) eller typen p-hus, garage, pendlar- eller flygplatsparkering,
//      och ett läge (gatuadress eller koordinater).
//   3. Storlek: minst 20 platser, eller p-hus/garage/pendlar/flyg där antalet platser är okänt.
//   4. Minst 5 informationspoäng (se POANG): pris, taxa, öppettider, storlek, laddplatser, handikapplatser osv.
// KOMMUNSIDA (/<kommun>/) byggs om kommunen har minst en parkeringssida, eller verifierad gatutaxa från kommunen,
// eller minst 8 parkeringar med minst 5 konkreta uppgifter om pris, avgiftsfrihet, tidsgräns, laddplatser eller handikapplatser.
// Övriga kommuner visas som egen sektion med ankare på länssidan.

export const STORA_TYPER = ["parkeringshus", "parkeringsgarage", "pendlarparkering", "flygplatsparkering"];
export const MIN_PLATSER = 20;
export const MIN_POANG = 5;
export const KOMMUN_MIN = { parkeringar: 8, uppgifter: 5 };

const DYGNET_RUNT = "00:00-24:00";
export const dygnetRunt = (o) => !!o && Object.values(o).every((v) => v === DYGNET_RUNT);
const GATUNAMN = /(gatan|vägen|väg|gata|gränd|stigen|allén|alle|backe|leden|plan|torget)\b/i;
/** Namn som bara är en adress ("Basilikavägen 12 / Karlsdalsallén 50") – ingen söker på dem. */
export const adressNamn = (e) => (e.gatuadress && e.namn === e.gatuadress) || (/\d/.test(e.namn) && GATUNAMN.test(e.namn));

/** Taxa som bara gäller hyresgäster, abonnemang eller laddning – inte besöksparkering. */
const ICKE_BESOK = /^(endast elbilsladdning|laddning förhyrda|boende|hyresgäst|abonnemang)/i;
export function arPrivat(e) {
  const op = e.extra?.op;
  return !!(op?.endast_uthyrning || op?.kategori === "Förhyrd parkering" || ICKE_BESOK.test(e.extra?.taxa ?? ""));
}

export const kanda = (v) => (v != null && v !== 0 ? v : null);
export const platser = (e) => kanda(e.verifierad?.platser) ?? kanda(e.extra?.kapacitet);
export const harPris = (e) => e.extra?.taxa_per_timme != null || e.extra?.avgift === false || e.verifierad?.timpris != null;
const DETALJ = /(24 ?h|24-tim|dygn|dag|kväll|natt|periodbiljett|månad|helg|lör|sön)/i;

/** Informationspoäng för en parkering, med vad som gav poäng (visas i testerna och i loggen). */
export function poang(e) {
  const x = e.extra ?? {}, v = e.verifierad, p = platser(e);
  const delar = [];
  if (harPris(e)) delar.push(["pris", 2]);
  if (DETALJ.test(x.taxa ?? "") || (v?.taxa?.length ?? 0) >= 2) delar.push(["taxa", 1]);
  if ((e.oppettider && !dygnetRunt(e.oppettider)) || (v?.oppettider && !/dygnet runt/i.test(v.oppettider))) delar.push(["tider", 1]);
  if (p >= 200) delar.push(["stor", 2]); else if (p >= 50) delar.push(["mellan", 1]);
  if (x.laddplatser || v?.laddplatser) delar.push(["ladd", 1]);
  if (x.handikapplatser || v?.hcp) delar.push(["hcp", 1]);
  if (x.hojdbegransning || v?.hojd_m) delar.push(["hojd", 1]);
  if (x.max_tid) delar.push(["maxtid", 1]);
  if (x.zonkod) delar.push(["zonkod", 1]);
  if (x.anmarkning) delar.push(["anm", 1]);
  if (x.op?.uppvarmd) delar.push(["varm", 1]);
  if (STORA_TYPER.includes(e.typ)) delar.push(["typ", 1]);
  if (v) delar.push(["verifierad", 2]);
  return { summa: delar.reduce((s, [, n]) => s + n, 0), delar: delar.map(([k]) => k) };
}

export function harEgenSida(e) {
  if (arPrivat(e)) return false;
  const stor = STORA_TYPER.includes(e.typ);
  if (!(e.gatuadress || e.lat != null)) return false;
  if (adressNamn(e) && !stor) return false;
  const p = platser(e);
  if (!(p >= MIN_PLATSER || (stor && p == null))) return false;
  return poang(e).summa >= MIN_POANG;
}

/** Antal konkreta uppgifter i en kommun: pris, avgiftsfri, tidsgräns, laddplatser, handikapplatser (en per parkering och slag). */
export const kommunUppgifter = (enheter) => enheter.reduce((s, e) => {
  const x = e.extra ?? {};
  return s + (x.taxa_per_timme > 0) + (x.avgift === false || x.taxa_per_timme === 0) + !!x.max_tid + !!x.laddplatser + !!x.handikapplatser;
}, 0);

export function kommunHarSida(k, harTaxa = false) {
  if (k.enheter.some((e) => e.egenSida)) return true;
  if (harTaxa) return true;
  return k.enheter.length >= KOMMUN_MIN.parkeringar && kommunUppgifter(k.enheter) >= KOMMUN_MIN.uppgifter;
}
