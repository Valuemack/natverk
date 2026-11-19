// Opening-hours helpers. Output format per day: "10:00-18:00" | "10:00-14:00,15:00-18:00" | "stängt" | null (unknown).
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function emptyHours() {
  return { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
}

const SV_DAY = {
  'måndag': 'mon', 'mån': 'mon', 'må': 'mon', 'man': 'mon',
  'tisdag': 'tue', 'tis': 'tue', 'ti': 'tue',
  'onsdag': 'wed', 'ons': 'wed', 'on': 'wed',
  'torsdag': 'thu', 'tors': 'thu', 'tor': 'thu', 'to': 'thu',
  'fredag': 'fri', 'fre': 'fri', 'fr': 'fri',
  'lördag': 'sat', 'lör': 'sat', 'lö': 'sat', 'lordag': 'sat',
  'söndag': 'sun', 'sön': 'sun', 'sö': 'sun', 'sondag': 'sun',
};

/** Map a Swedish day name/abbreviation (any case, optional trailing "ar"/"en"/".") to mon..sun, or null. */
export function svDay(s) {
  if (!s) return null;
  let k = s.toLowerCase().replace(/[.:]/g, '').trim();
  if (SV_DAY[k]) return SV_DAY[k];
  k = k.replace(/(ar|en|arna)$/, '');
  if (SV_DAY[k]) return SV_DAY[k];
  if (SV_DAY[k + 'dag']) return SV_DAY[k + 'dag'];
  return null;
}

function hhmm(t) {
  const m = String(t).trim().match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  if (h > 24 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

/** Normalize a time-range string like "10.00 – 18.00", "10-18", "kl 11–16" → "10:00-18:00". Returns "stängt" for closed, null if unparsable. */
export function normRange(s) {
  if (s == null) return null;
  const t = String(s).replace(/&#8211;|&ndash;|–|—|−/g, '-').replace(/\bkl\.?\s*/gi, '').trim();
  if (!t) return null;
  if (/st[äa]ngt|closed|^off$/i.test(t)) return 'stängt';
  const parts = [];
  const re = /(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)/g;
  let m;
  while ((m = re.exec(t))) {
    const a = hhmm(m[1]), b = hhmm(m[2]);
    if (a && b) parts.push(a + '-' + b);
  }
  return parts.length ? parts.join(',') : null;
}

/**
 * Minimal OSM opening_hours parser for the common forms:
 * "Mo-Fr 10:00-18:00; Sa 10:00-15:00; Su off", "Mo,We 11-17", "24/7".
 * Ignores PH/SH rules, month/week selectors (returns null when such selectors are the only content).
 */
export function parseOsmHours(oh) {
  if (!oh) return null;
  const out = emptyHours();
  const idx = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
  if (oh.trim() === '24/7') { for (const d of DAYS) out[d] = '00:00-24:00'; return out; }
  let any = false;
  for (let rule of oh.split(/;|\|\|/)) {
    rule = rule.trim();
    if (!rule) continue;
    // Skip rules with month / week / date selectors or PH/SH - too specific for a weekly table.
    if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|PH|SH|easter)\b/.test(rule) && !/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(rule)) continue;
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\[[^\]]*\])?(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)\s*(.*)$/);
    let days, rest;
    if (m) { days = m[1]; rest = m[2]; } else if (/^\d/.test(rule)) { days = 'Mo-Su'; rest = rule; } else continue;
    if (/\[/.test(days)) continue; // "Sa[1]" = first Saturday of month; not weekly
    const sel = new Set();
    for (const part of days.split(',')) {
      const p = part.trim(); if (!p) continue;
      const r = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
      if (!r) continue;
      const a = idx[r[1]], b = r[2] != null ? idx[r[2]] : a;
      for (let i = a; ; i = (i + 1) % 7) { sel.add(i); if (i === b) break; }
    }
    rest = rest.replace(/,?\s*PH.*$/, '').trim();
    let val;
    if (/^(off|closed)\b/i.test(rest)) val = 'stängt';
    else {
      const ranges = [...rest.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)].map(x => hhmm(x[1]) + '-' + hhmm(x[2]));
      if (!ranges.length) continue;
      val = ranges.join(',');
    }
    for (const i of sel) { out[DAYS[i]] = val; any = true; }
  }
  if (!any) return null;
  // OSM convention: when a weekly schedule is given, unspecified days are closed.
  for (const d of DAYS) if (out[d] == null) out[d] = 'stängt';
  return out;
}

export function hasHours(h) {
  return !!h && DAYS.some(d => h[d] != null);
}
