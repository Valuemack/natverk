// Helgdagstider för enhetssidor: kommande helgdagar och helgaftnar, med verksamhetens
// avvikande öppettider där källan har publicerat dem (t.ex. apotekskedjornas "avvikande tider").
// Inga tider gissas – saknas uppgift visas det som ej publicerat.
import { helgdagarAr } from "../../../sites/rodadagar/src/lib/helgdagar.js";
import { iso, franIso, plusDagar, veckodag, kort } from "./datum.js";
import { tolkaIntervall, dagText } from "./katalog.js";

/** Helgdagar och helgaftnar inom `dagar` dagar från `idag` (Date, UTC-midnatt). */
export function kommandeHelger(idag, dagar = 45) {
  const slut = plusDagar(idag, dagar);
  const y = idag.getUTCFullYear();
  return [...helgdagarAr(y), ...helgdagarAr(y + 1)]
    .filter((h) => h.datum >= idag && h.datum <= slut)
    .map((h) => ({ namn: h.namn, slug: h.slug, typ: h.typ, datum: h.datum, iso: iso(h.datum) }));
}

/** Avvikande tider per ISO-datum, inklusive intervall med "till". */
export function avvikandePerDatum(e) {
  const ut = {};
  for (const a of e?.avvikande_oppettider ?? []) {
    if (!a?.datum) continue;
    let d = a.datum;
    const till = a.till ?? a.datum;
    for (let i = 0; i < 40 && d <= till; i++) {
      ut[d] = { tid: a.tid, orsak: a.orsak || null };
      d = iso(plusDagar(franIso(d), 1));
    }
  }
  return ut;
}

/** Helgdag i löptext: "julafton", men "Kristi himmelsfärdsdag" och "Sveriges nationaldag". */
export const helgFras = (s) => (/^(Kristi|Sveriges)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/**
 * Helgdagstider för en enhet. Returnerar null om ingen helgdag är nära.
 * rader: [{ namn, iso, datumText, veckodag, tid (råtext eller null), text, iv }]
 */
export function helgTider(e, uppdateradIso, { dagar = 45 } = {}) {
  const idag = franIso(uppdateradIso);
  const helger = kommandeHelger(idag, dagar);
  if (!helger.length) return null;
  const avv = avvikandePerDatum(e);
  const rader = helger.map((h) => {
    const a = avv[h.iso];
    const iv = a ? tolkaIntervall(a.tid) : null;
    return {
      namn: h.namn, slug: h.slug, iso: h.iso, typ: h.typ, datumText: kort(h.datum), veckodag: veckodag(h.datum),
      tid: a?.tid ?? null, iv, text: a ? (iv && iv.length === 0 ? "Stängt" : dagText(a.tid)) : null,
    };
  });
  const harData = rader.some((r) => r.tid);
  const jul = rader.some((r) => /^(julafton|juldagen|annandag-jul|nyarsafton|nyarsdagen)$/.test(r.slug));
  const julRad = rader.find((r) => /^(julafton|juldagen|annandag-jul|nyarsafton)$/.test(r.slug));
  const ar = julRad ? julRad.iso.slice(0, 4) : null;
  const rubrik = jul ? `Öppettider i jul och nyår${ar ? ` ${ar}` : ""}` : `Öppettider kring ${helgFras(rader[0].namn)}`;
  return { rader, harData, rubrik, jul };
}

/** schema.org specialOpeningHoursSpecification för publicerade avvikande tider. */
export function specialLd(ht) {
  if (!ht?.harData) return undefined;
  const ut = [];
  for (const r of ht.rader) {
    if (!r.tid || r.iv === null) continue;
    if (r.iv.length === 0) ut.push({ "@type": "OpeningHoursSpecification", validFrom: r.iso, validThrough: r.iso, opens: "00:00", closes: "00:00" });
    for (const [a, b] of r.iv) {
      const hh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      ut.push({ "@type": "OpeningHoursSpecification", validFrom: r.iso, validThrough: r.iso, opens: hh(a), closes: hh(b) });
    }
  }
  return ut.length ? ut : undefined;
}

/** FAQ-fråga om första kommande helgdag. Ärligt svar även när tider saknas. */
export function helgFraga(e, ht, ordinarie) {
  if (!ht) return null;
  const r = ht.rader[0];
  const nar = `${helgFras(r.namn)} (${r.veckodag} ${r.datumText})`;
  if (r.tid) {
    const svar = r.iv?.length === 0
      ? `Nej, ${e.namn} har stängt på ${nar}.`
      : `Ja, ${e.namn} har öppet ${r.text} på ${nar}.`;
    return { fraga: `Har ${e.namn} öppet på ${helgFras(r.namn)}?`, svar: `${svar} Uppgiften kommer från ${e.kedja ?? "verksamheten"} och kontrolleras varje natt.` };
  }
  const avvik = "på helgdagar och helgaftnar avviker tiderna ofta";
  return {
    fraga: `Har ${e.namn} öppet på ${helgFras(r.namn)}?`,
    svar: `${e.namn} har inte publicerat särskilda öppettider för ${nar} än. ${ordinarie ? `Ordinarie ${r.veckodag}stider är ${ordinarie}, men ${avvik}` : avvik.charAt(0).toUpperCase() + avvik.slice(1)} – kontrollera med ${e.namn} innan du åker. Vi uppdaterar sidan varje natt.`,
  };
}
