// Tolkning av 1177.se-sidor (Hitta vård). Sidorna bäddar in sitt tillstånd som
// window.__PRELOADED_STATE__ = {...}.__PRELOADED_STATE__ i en <script>-tagg.
export function preloadedState(html) {
  const i = html.indexOf('window.__PRELOADED_STATE__');
  if (i < 0) throw new Error('Hittade inte __PRELOADED_STATE__');
  const a = html.indexOf('{', i); const e = html.indexOf('</script>', a);
  const t = html.slice(a, e).trim().replace(/\.__PRELOADED_STATE__;?\s*$/, '').replace(/;\s*$/, '');
  const j = JSON.parse(t);
  return j.__PRELOADED_STATE__ || j;
}

export const BASE_1177 = 'https://www.1177.se';
export const CARETYPE_VC = 'Vårdcentral';

// batchsize över ca 1000 ger HTTP 500, därför sidindelning (p=1,2,...).
export function searchUrl(page, batchsize = 100, caretype = CARETYPE_VC) {
  const q = new URLSearchParams({ caretype, s: 'name', region: '00', batchsize: String(batchsize), p: String(page) });
  return `${BASE_1177}/hitta-vard/?${q}`;
}
export function cardUrl(hsaId) {
  return `${BASE_1177}/hitta-vard/kontaktkort/?hsaid=${encodeURIComponent(hsaId)}`;
}

// Fält i kontaktkortet som är stora fria texter och inte behövs. Vi sparar bara
// faktauppgifter (adress, tider, telefon m.m.) + flaggor som härleds ur texten.
const DROP = new Set(['FeedbackForm', 'ReadMoreLinks', 'Related', 'StaticMapUrl', 'LogotypeUrl', 'UnitQualityIndicator', 'AboutUs', 'Description', 'FindCareHow', 'YourVisit', 'VisitorInformation', 'CurrentInfo', 'EServices']);

function htmlToText(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&aring;/g, 'å').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö')
    .replace(/&Aring;/g, 'Å').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&eacute;/g, 'é').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// Höj när compactCard ändras, så att cachade kort hämtas om.
export const CARD_SCHEMA = 2;

export function compactCard(card) {
  const out = {};
  for (const [k, v] of Object.entries(card)) if (!DROP.has(k)) out[k] = v;
  // Ägarform + vem som driver enheten ("Verksamheten drivs av X AB på uppdrag av Region Y").
  const of = card.AboutUs?.OwnerAndFinancing;
  if (of) out.OwnerAndFinancing = { OwnerType: of.OwnerType ?? null, FinancingText: htmlToText(of.FinancingText) || null };
  // Text som kan avslöja drop-in / närakut / jour. Sparas bara som korta träffutdrag.
  const texts = [];
  const walk = (v) => { if (v == null) return; if (typeof v === 'string') texts.push(htmlToText(v)); else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk); };
  for (const k of ['FindCareHow', 'CurrentInfo', 'AboutUs', 'Description', 'YourVisit']) walk(card[k]);
  const all = texts.join(' \n ');
  const snip = (re) => { const m = all.match(re); if (!m) return null; const i = Math.max(0, m.index - 80); return all.slice(i, m.index + m[0].length + 80).trim(); };
  out._flags = {
    dropinText: snip(/drop[\s-]?in/i),
    narakutText: snip(/närakut/i),
    jourText: snip(/\bjour(mottagning|central|öppet)?\b/i),
    eServiceNames: (card.EServices || []).map((e) => e.Text).filter(Boolean).slice(0, 15),
  };
  return out;
}
