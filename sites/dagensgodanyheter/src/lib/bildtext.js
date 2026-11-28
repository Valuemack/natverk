// Gemensamma regler för bilderna, för både nattskripten (scripts/lib/ai-bild.mjs, bilder.mjs) och sajten
// (bildtext under bilden, schema, policysidan).

/**
 * Stil för de skapade bilderna:
 *   "illustration" – målad gouache- och tuschillustration (standard)
 *   "foto"         – hyperrealistisk bild av en allmän motivscen (en utter i en älv, solpaneler på en äng, händer som
 *                    planterar ett träd) – aldrig verkliga, namngivna personer, platser eller den faktiska händelsen.
 * Kan sättas med GODA_BILDSTIL. Bestäm bildtexten (BILDTEXT_GENERERAD) innan "foto" slås på.
 */
export const BILDSTIL = ["foto", "illustration"].includes(process.env.GODA_BILDSTIL) ? process.env.GODA_BILDSTIL : "illustration";

/** Bildtexten under varje skapad bild. Ändras här och slår igenom på alla sidor, även för äldre bilder. */
export const BILDTEXT_GENERERAD = "Illustration: Dagens goda nyheter";

/** Alt-text: beskriver vad bilden visar, på svenska, i en eller två hela meningar. */
export const ALT_MIN = 80;
export const ALT_MAX = 125;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-zåäöéü0-9]+/g, " ").trim();

/** Fel i en alt-text, eller null om den är godkänd. */
export function altFel(alt, rubrik = "") {
  const t = String(alt ?? "").trim();
  if (!t) return "alt-texten saknas";
  if (t.length < ALT_MIN) return `alt-texten är för kort (${t.length} tecken, minst ${ALT_MIN})`;
  if (t.length > ALT_MAX) return `alt-texten är för lång (${t.length} tecken, högst ${ALT_MAX})`;
  if (!/[.!]$/.test(t)) return "alt-texten ska vara en hel mening som slutar med punkt";
  if (/\b(och|med|i|på|av|en|ett|som|vid|till|från|samt)[.!]$/i.test(t)) return "alt-texten slutar mitt i en mening";
  if (/\bai\b/i.test(t)) return 'alt-texten innehåller ordet "AI"';
  if (rubrik && norm(t) === norm(rubrik)) return "alt-texten upprepar rubriken";
  if (rubrik && norm(t).includes(norm(rubrik))) return "alt-texten innehåller hela rubriken";
  if (!/[åäö]|\b(och|en|ett|med|av|på|i|som|vid|under|över)\b/i.test(t)) return "alt-texten verkar inte vara på svenska";
  return null;
}

/** Enkel rättning av en äldre alt-text utan modell: "Illustration:"-prefixet bort, stor bokstav, punkt på slutet. */
export function enkelAlt(alt) {
  let t = String(alt ?? "").trim().replace(/^illustration\s*:\s*/i, "");
  if (!t) return "";
  t = t[0].toUpperCase() + t.slice(1);
  return /[.!]$/.test(t) ? t : `${t}.`;
}
