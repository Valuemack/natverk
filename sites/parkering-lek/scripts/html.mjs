// HTML-hjälpare och öppettidsnormalisering (inga beroenden).
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', eacute: 'é', Eacute: 'É', uuml: 'ü', Uuml: 'Ü', mdash: '—', ndash: '–', hellip: '…', shy: '', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', deg: '°', times: '×', euro: '€' };
export function decodeEntities(s) {
  return String(s ?? '').replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n] ?? m);
}
export function htmlToText(h) {
  return decodeEntities(String(h).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/dt|\/dd)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t  ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
export function attr(h, name) {
  const m = String(h).match(new RegExp(`${name}="([^"]*)"`)) || String(h).match(new RegExp(`${name}='([^']*)'`));
  return m ? decodeEntities(m[1]) : null;
}
export function jsonLd(h) {
  const out = [];
  for (const m of String(h).matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); for (const x of [j].flat()) out.push(x); } catch { /* trasig JSON-LD ignoreras */ }
  }
  return out;
}
export const num = (s) => { if (s == null) return null; const m = String(s).replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; };

// --- öppettider -> { mon..sun: "HH:MM-HH:MM" | "stängt" } ---
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EN = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun', mo: 'mon', tu: 'tue', we: 'wed', th: 'thu', fr: 'fri', sa: 'sat', su: 'sun' };
const SV = { mån: 'mon', måndag: 'mon', tis: 'tue', tisdag: 'tue', ons: 'wed', onsdag: 'wed', tor: 'thu', tors: 'thu', torsdag: 'thu', fre: 'fri', fredag: 'fri', lör: 'sat', lördag: 'sat', sön: 'sun', söndag: 'sun' };
const hm = (t) => { const m = String(t).match(/(\d{1,2})[:.]?(\d{2})?/); if (!m) return null; return `${m[1].padStart(2, '0')}:${(m[2] || '00')}`; };
function span(a, b) {
  let o = hm(a), c = hm(b); if (!o || !c) return null;
  if (c === '23:59' || (c === '00:00' && o === '00:00') || c === '24:00') c = '24:00';
  return `${o}-${c}`;
}
export function hoursFromSchema(spec) {
  if (!Array.isArray(spec) || !spec.length) return null;
  const out = Object.fromEntries(DAYS.map((d) => [d, 'stängt'])); let any = false;
  for (const s of spec) {
    for (const d0 of [s.dayOfWeek].flat()) {
      const d = EN[String(d0 || '').split('/').pop().toLowerCase()]; if (!d) continue;
      const v = span(s.opens, s.closes); if (!v) continue;
      out[d] = out[d] === 'stängt' ? v : `${out[d]},${v}`; any = true;
    }
  }
  return any ? out : null;
}
// Svensk text, t.ex. "Alla dagar: 06:00 - 01:00", "Mån-Fre 07-19", "Lör-Sön: Stängt", "Dygnet runt".
export function hoursFromSwedish(lines) {
  const out = {}; let any = false;
  for (const raw of [lines].flat()) {
    const l = String(raw).toLowerCase().replace(/–|—/g, '-').trim();
    if (/dygnet runt|alltid öppet|00[:.]?00\s*-\s*24[:.]?00/.test(l) && /alla dagar|dygnet runt|alltid/.test(l)) { for (const d of DAYS) out[d] = '00:00-24:00'; any = true; continue; }
    const m = l.match(/^(alla dagar|vardagar|helger|[a-zåäö]+)(?:\s*-\s*([a-zåäö]+))?\s*:?\s*(.*)$/); if (!m) continue;
    let days;
    if (m[1] === 'alla dagar') days = DAYS; else if (m[1] === 'vardagar') days = DAYS.slice(0, 5); else if (m[1] === 'helger') days = ['sat', 'sun'];
    else { const a = SV[m[1]], b = m[2] ? SV[m[2]] : a; if (!a || !b) continue; days = DAYS.slice(DAYS.indexOf(a), DAYS.indexOf(b) + 1); }
    const rest = m[3];
    let v = null;
    if (/stängt/.test(rest)) v = 'stängt';
    else { const t = rest.match(/(\d{1,2}(?:[:.]\d{2})?)\s*-\s*(\d{1,2}(?:[:.]\d{2})?)/); if (t) v = span(t[1], t[2]); }
    if (!v) continue;
    for (const d of days) out[d] = v; any = true;
  }
  if (!any) return null;
  for (const d of DAYS) if (!out[d]) return null; // ofullständigt -> hellre null än gissning
  return out;
}
