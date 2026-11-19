// Opening-hours parsers -> { mon, tue, wed, thu, fri, sat, sun } with "HH:MM-HH:MM[,HH:MM-HH:MM]" | "stängt" | null
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const OSM_DAY = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const MON = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const MON_RANGE = String.raw`${MON}(?:\s*\d{1,2})?(?:\s*-\s*(?:${MON}\s*)?\d{0,2})?`;
const DATE_SELECTOR = new RegExp(String.raw`^(${MON_RANGE}(?:\s*,\s*${MON_RANGE})*)\s*:?\s*`);
const SPLIT_BEFORE_MONTH = new RegExp(String.raw`,\s*(?=${MON}\b)`);

const pad = (n) => String(n).padStart(2, '0');
function hm(h, m) {
  h = Number(h); m = Number(m || 0);
  if (!(h >= 0 && h <= 24 && m >= 0 && m < 60)) return null;
  return `${pad(h)}:${pad(m)}`;
}
function range(a, b) {
  if (!a || !b) return null;
  if (b === '00:00') b = '24:00';
  if (b <= a) return null; // overnight or garbage – libraries do not do that
  return `${a}-${b}`;
}
const weekToObj = (arr) => Object.fromEntries(DAYS.map((d, i) => [d, arr[i]]));

/** "Jan 01-Jun 17, Aug 13-Dec 31" / "Jun-Aug" / "Jun 18-Aug 12" -> true/false for `date`, undefined if unparseable */
function dateSelectorMatches(sel, date) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  let any = false;
  for (const part of sel.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Z][a-z]{2})(?:\s*(\d{1,2}))?(?:\s*-\s*(?:([A-Z][a-z]{2})\s*)?(\d{1,2})?)?$/);
    if (!m || !MONTHS[m[1]]) return undefined;
    const m1 = MONTHS[m[1]], d1 = m[2] ? +m[2] : 1;
    let m2, d2;
    if (m[3]) { m2 = MONTHS[m[3]]; if (!m2) return undefined; d2 = m[4] ? +m[4] : 31; }
    else if (m[4]) { m2 = m1; d2 = +m[4]; }
    else { m2 = m1; d2 = m[2] ? d1 : 31; }
    const a = m1 * 100 + d1, b = m2 * 100 + d2;
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) any = true;
  }
  return any;
}

const WEEK_SELECTOR = /^week\s*(\d{1,2}(?:\s*-\s*\d{1,2})?(?:\s*,\s*\d{1,2}(?:\s*-\s*\d{1,2})?)*)\s*:?\s*/;

/** ISO 8601 week number */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
}
/** "26-32" / "01-25,33-53" -> true/false for `date` */
function weekSelectorMatches(sel, date) {
  const w = isoWeek(date);
  let any = false;
  for (const part of sel.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
    if (!m) return undefined;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a <= b ? w >= a && w <= b : w >= a || w <= b) any = true;
  }
  return any;
}

/**
 * Parse an OSM opening_hours value into the week that applies on `date`.
 * Supports weekday ranges/lists, several time spans, off/closed, 24/7, month/date range prefixes
 * (evaluated against `date`), comments (a comment containing "meröppet" routes the rule to meröppet hours).
 * week-number selectors ("week 26-32") are supported; PH/SH/year rules are ignored. Returns { week, meroppetWeek, ok, notes }.
 */
export function parseOsmHours(value, date = new Date()) {
  const notes = [];
  const out = { week: null, meroppetWeek: null, ok: false, notes };
  if (!value) return out;
  let v = value.trim();
  if (/^24\/7$/.test(v)) { out.week = weekToObj(DAYS.map(() => '00:00-24:00')); out.ok = true; return out; }
  const comments = [];
  v = v.split('||')[0].replace(/"[^"]*"/g, (c) => `"#${comments.push(c.slice(1, -1)) - 1}"`);
  // split on ';', and on ', <Month>' once the previous piece has a time span (sloppy comma-separated seasonal rules)
  const rules = [];
  for (const piece of v.split(';')) {
    let acc = '';
    for (const p of piece.split(SPLIT_BEFORE_MONTH)) {
      acc = acc ? `${acc}, ${p}` : p;
      if (/\d{1,2}:\d{2}\s*-|\b(off|closed)\b/.test(p)) { rules.push(acc.trim()); acc = ''; }
    }
    if (acc.trim()) rules.push(acc.trim());
  }
  const staffed = Array(7).fill(undefined), self = Array(7).fill(undefined);
  let touchedStaffed = false, ok = true;
  // "Season block" style: "Jan 01-Jun 17, Aug 13-Dec 31 Mo-Th 10-19; Fr 10-18; ...; Jun 18-Aug 12 Mo-Th 12-18; Fr 10-16".
  // Strict OSM semantics would make "Fr 10-18" apply all year, but taggers clearly mean the date range to carry over
  // to the following rules. When the FIRST rule starts with a date/week selector, rules without their own selector
  // inherit the most recent one. Values that start with an undated base week keep strict semantics.
  const stripC = (r) => r.replace(/"#\d+"/g, '').trim();
  const hasSel = (r) => DATE_SELECTOR.test(stripC(r)) || WEEK_SELECTOR.test(stripC(r));
  const blockStyle = rules.length > 1 && hasSel(rules[0]);
  let sticky = null;
  for (let rule of rules) {
    let comment = '';
    rule = rule.replace(/"#(\d+)"/g, (_, i) => { comment += ' ' + comments[+i]; return ''; }).trim();
    if (comment.trim()) notes.push(comment.trim());
    const isSelf = /mer[öo]ppet|självservice|self/i.test(comment);
    if (!rule || /^(PH|SH)\b/.test(rule)) continue;
    rule = rule.replace(/\s*,\s*PH\b/g, '').replace(/\bPH\s*,\s*/g, '').replace(/\bopen\b/g, '').trim();
    if (/\b(PH|SH|easter)\b|\b(19|20)\d\d\b|week\s*\d+(\s*-\s*\d+)?\s*\//.test(rule)) { notes.push(`ignorerad regel: ${rule}`); continue; }
    // consume leading month/date and week selectors (in any order)
    const sels = [];
    for (let guard = 0; guard < 3; guard++) {
      const dm = rule.match(DATE_SELECTOR), wm = rule.match(WEEK_SELECTOR);
      if (dm) { sels.push({ type: 'date', sel: dm[1].trim() }); rule = rule.slice(dm[0].length).trim(); }
      else if (wm) { sels.push({ type: 'week', sel: wm[1].trim() }); rule = rule.slice(wm[0].length).trim(); }
      else break;
    }
    if (sels.length) sticky = sels;
    const active = sels.length ? sels : blockStyle ? sticky || [] : [];
    let match = true;
    for (const s of active) {
      const m = s.type === 'date' ? dateSelectorMatches(s.sel, date) : weekSelectorMatches(s.sel, date);
      if (m === undefined) { match = undefined; break; }
      if (!m) match = false;
    }
    if (match === undefined) { ok = false; notes.push(`okänd datumregel: ${rule}`); continue; }
    if (!match) continue;
    if (!rule) continue;
    const target = isSelf ? self : staffed;
    const tokens = rule.match(/(Mo|Tu|We|Th|Fr|Sa|Su)(\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?|\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?\+?|\b(off|closed)\b|,|\S+/g) || [];
    let days = [], times = [], closed = false, lastWasTime = false;
    const flush = () => {
      if (!days.length && (times.length || closed)) days = [0, 1, 2, 3, 4, 5, 6]; // no weekday = every day
      if (!days.length) return;
      const val = closed ? 'stängt' : times.length ? times.join(',') : null;
      if (val === null) { ok = false; days = []; return; }
      for (const d of days) target[d] = val; // later rule replaces earlier for these days (OSM ';' semantics)
      if (!isSelf) touchedStaffed = true;
      days = []; times = []; closed = false;
    };
    for (const t of tokens) {
      if (t === ',') continue;
      const dmatch = t.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
      if (dmatch) {
        if (lastWasTime) flush();
        lastWasTime = false;
        const a = OSM_DAY[dmatch[1]], b = dmatch[2] ? OSM_DAY[dmatch[2]] : a;
        for (let i = a; ; i = (i + 1) % 7) { days.push(i); if (i === b) break; }
        continue;
      }
      const tm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\+?$/);
      if (tm) {
        const r = range(hm(tm[1], tm[2]), hm(tm[3], tm[4]));
        if (!r) { ok = false; notes.push(`ogiltig tid: ${t}`); } else times.push(r);
        lastWasTime = true;
        continue;
      }
      if (/^(off|closed)$/.test(t)) { closed = true; lastWasTime = true; continue; }
      ok = false; notes.push(`okänd token: ${t}`);
    }
    flush();
  }
  if (self.some((x) => x !== undefined)) out.meroppetWeek = weekToObj(self.map((x) => (x === undefined ? 'stängt' : x)));
  if (!touchedStaffed) return out;
  out.week = weekToObj(staffed.map((x) => (x === undefined ? 'stängt' : x))); // OSM: unlisted days are closed
  out.ok = ok;
  return out;
}

/**
 * Summer/winter split of an OSM value: evaluates every day of `year`. Returns null unless the staffed week on
 * Jul 15 differs from the one on Jan 15 and both are known. Otherwise
 * { sommar: { fran: "MM-DD", till: "MM-DD", tider }, vinter: { fran, till, tider } } where the ranges are the
 * contiguous blocks (wrapping over new year) around Jul 15 and Jan 15.
 */
export function osmSeasons(value, year = new Date().getFullYear()) {
  if (!value || !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\bweek\b/.test(value)) return null;
  const days = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d = new Date(year, d.getMonth(), d.getDate() + 1)) {
    const w = parseOsmHours(value, d).week;
    days.push({ d, key: w ? JSON.stringify(w) : null, w });
  }
  const idx = (m, dd) => days.findIndex((x) => x.d.getMonth() === m && x.d.getDate() === dd);
  const s = days[idx(6, 15)], v = days[idx(0, 15)];
  if (!s.key || !v.key || s.key === v.key) return null;
  const block = (i0) => {
    const n = days.length, key = days[i0].key;
    let a = i0, b = i0;
    for (let k = 0; k < n && days[(a - 1 + n) % n].key === key; k++) a = (a - 1 + n) % n;
    for (let k = 0; k < n && days[(b + 1) % n].key === key; k++) b = (b + 1) % n;
    const fmt = (x) => `${pad(x.d.getMonth() + 1)}-${pad(x.d.getDate())}`;
    return { fran: fmt(days[a]), till: fmt(days[b]) };
  };
  return { sommar: { ...block(idx(6, 15)), tider: s.w }, vinter: { ...block(idx(0, 15)), tider: v.w } };
}

// ---------- Swedish free text (Biblioteksdatabasen open_hours) ----------
const SV_DAYS = [
  [/^m[åa]n(d|dag(ar)?)?$|^m[åa]$/, 0], [/^tis(d|dag(ar)?)?$|^ti$/, 1], [/^ons(d|dag(ar)?)?$|^on$/, 2],
  [/^tor(s(d|dag(ar)?)?)?$|^to$/, 3], [/^fre(d|dag(ar)?)?$|^fr$/, 4], [/^l[öo]r(d|dag(ar)?)?$|^l[öo]$/, 5], [/^s[öo]n(d|dag(ar)?)?$|^s[öo]$/, 6],
];
function svDay(w) {
  w = w.toLowerCase().replace(/[.:]$/, '');
  for (const [re, i] of SV_DAYS) if (re.test(w)) return i;
  return -1;
}
const SEASONAL = /sommar|vinter|\bjul\b|påsk|midsommar|helg(dag|afton)|\bv\.?\s?\d|vecka|\d{1,2}\/\d{1,2}|januari|februari|mars|april|\bmaj\b|juni|juli|augusti|september|oktober|november|december|\bfrån\b|fr\.?\s?o\.?\s?m|t\.o\.m|tills vidare|ombyggnad|renover/i;
const SELF = /mer[öo]ppet|meröppen|självservice|obemannat/i;

/**
 * Parse Swedish opening-hours text like "Måndag 10:00 - 19:00\r\nSöndag Stängt" or "Mån-tors 10-19".
 * Returns { week, meroppet, meroppetWeek, ok, notes, closedIndefinitely }.
 */
export function parseSwedishHours(text) {
  const notes = [];
  const res = { week: null, meroppet: false, meroppetWeek: null, ok: false, notes, closedIndefinitely: false };
  if (!text) return res;
  if (/st[äa]ngt\s+tills\s+vidare|permanent\s+st[äa]ngt|^\s*st[äa]ngt\s*$/i.test(text)) res.closedIndefinitely = true;
  if (SELF.test(text)) res.meroppet = true;
  const staffed = Array(7).fill(undefined), self = Array(7).fill(undefined);
  let parsedLines = 0, unparsed = 0;
  // join "Måndag" + "12:00 - 19:00" written on separate lines
  const lines = [];
  // "må 12-17, ti 12-19" -> separate groups (but keep "Mån, tis, tors 10-19" together)
  const DAYGROUP = /,\s*(?=(?:m[åa]n|tis|ons|tor|fre|l[öo]r|s[öo]n|m[åa]|ti|on|to|fr|l[öo]|s[öo])[a-zåäö]*\.?\s*[-–:\d])/i;
  const splitGroups = (l) => {
    const out = [];
    let acc = '';
    for (const p of l.split(DAYGROUP)) {
      acc = acc ? `${acc}, ${p}` : p;
      if (/\d|st[äa]ng/i.test(p)) { out.push(acc); acc = ''; } // a group ends once it has a time
    }
    if (acc) out.push(acc);
    return out;
  };
  for (const raw of text.split(/\r?\n|;/).flatMap(splitGroups)) {
    const line = raw.trim();
    if (!line) continue;
    const prev = lines[lines.length - 1];
    const prevIsDaysOnly = prev && /^[a-zåäö\s,–-]+:?$/i.test(prev) && prev.split(/[\s,–:-]+/).filter(Boolean).every((w) => svDay(w) >= 0);
    if (prevIsDaysOnly) lines[lines.length - 1] = `${prev} ${line}`;
    else lines.push(line);
  }
  let mode = 'staffed';
  const ALL = /alla dagar|varje dag|dagligen|alla veckans dagar/i;
  outer: for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/telefon|tfn/i.test(line)) continue;
    const hasTime = /\d/.test(line) || /st[äa]ng(t|d)/i.test(line);
    const hasDay = line.split(/[^a-zåäö]+/i).some((w) => w && svDay(w) >= 0) || ALL.test(line);
    if (!hasTime || !hasDay) {
      // header or prose line
      if (SELF.test(line) && !hasTime) { mode = 'self'; continue; }
      if (SEASONAL.test(line)) {
        if (parsedLines > 0) {
          notes.push('säsongsavsnitt från: ' + line);
          if (/sommar/i.test(line)) res.sommarSection = { header: line, text: lines.slice(li + 1).join('\n') };
          break;
        }
        continue;
      }
      if (hasDay) unparsed++;
      continue;
    }
    if (SEASONAL.test(line) || /endast|elever|skolans|förskol/i.test(line)) { notes.push('ignorerad rad: ' + line); unparsed++; continue; }
    const target = mode === 'self' || SELF.test(line) ? self : staffed;
    const m = line.match(/^(.*?)(?=\d|st[äa]ngt|st[äa]ngd|closed)(.*)$/i); // days part = text before first digit/"stängt"
    if (!m) { unparsed++; continue; }
    const dayPart = m[1].replace(/[:–—]/g, (c) => (c === ':' ? ' ' : '-')).replace(/\b(kl|klockan|öppet|bemannat|mer[öo]ppet)\b\.?/gi, '').trim();
    const rest = m[2];
    const days = [];
    if (ALL.test(dayPart)) days.push(0, 1, 2, 3, 4, 5, 6);
    else for (const seg of dayPart.split(/,|\boch\b|&|\//i).map((x) => x.trim()).filter(Boolean)) {
      const words = seg.split(/\s*-\s*/).map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
      const segDays = words.map(svDay);
      if (segDays.some((d) => d < 0)) continue;
      if (segDays.length === 2) { for (let i = segDays[0]; ; i = (i + 1) % 7) { days.push(i); if (i === segDays[1]) break; } }
      else if (segDays.length === 1) days.push(segDays[0]);
    }
    if (!days.length) { unparsed++; continue; }
    let val;
    if (/^\s*st[äa]ng(t|d)|^\s*closed/i.test(rest)) val = 'stängt';
    else {
      const spans = [...rest.matchAll(/(\d{1,2})(?:[.:](\d{2}))?\s*(?:-|–|—|till)\s*(\d{1,2})(?:[.:](\d{2}))?/g)]
        .map((x) => range(hm(x[1], x[2]), hm(x[3], x[4]))).filter(Boolean);
      if (!spans.length) { unparsed++; continue; }
      val = spans.join(',');
    }
    // a day that is already set means a new (seasonal/alternative) section has started
    if (days.some((d) => target[d] !== undefined)) { notes.push('nytt avsnitt ignorerat från: ' + line); break outer; }
    for (const d of days) target[d] = val;
    parsedLines++;
  }
  const count = staffed.filter((x) => x !== undefined).length;
  if (count >= 3 || (count >= 1 && unparsed === 0)) {
    const fill = unparsed === 0 ? 'stängt' : null; // every line understood -> unlisted days are closed, else unknown
    res.week = weekToObj(staffed.map((x) => (x === undefined ? fill : x)));
    res.ok = unparsed === 0;
  }
  if (self.some((x) => x !== undefined)) res.meroppetWeek = weekToObj(self.map((x) => (x === undefined ? null : x)));
  if (parsedLines === 0) res.ok = false;
  // a "Sommartider ..." section after the regular hours -> parse it as the summer week
  if (res.sommarSection && res.week) {
    const sub = parseSwedishHours(res.sommarSection.text);
    if (sub.week && sub.ok) res.sommar = { ...svPeriod(res.sommarSection.header), tider: sub.week };
  }
  delete res.sommarSection;
  return res;
}

const SV_MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
/** "Sommartider V26-V32:" -> {fran:"v26", till:"v32"}; "juni-augusti" -> {fran:"06-01", till:"08-31"}; else nulls */
function svPeriod(h) {
  const w = h.match(/\bv\.?\s?(\d{1,2})\s*[-–]\s*v?\.?\s?(\d{1,2})/i);
  if (w) return { fran: `v${+w[1]}`, till: `v${+w[2]}` };
  if (/mitten|början|slutet|ca\b|omkring/i.test(h)) return { fran: null, till: null }; // vague -> unknown
  // every whole-word month (optionally preceded by a day): "juni, juli, augusti" / "18 juni-14 aug"
  const ms = [...h.matchAll(/(?:(\d{1,2})\s*)?\b(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|okt|nov|dec)\b\.?/gi)]
    .map((x) => ({ day: x[1] ? +x[1] : null, m: SV_MONTHS.findIndex((n) => n.startsWith(x[2].toLowerCase().slice(0, 3))) }));
  if (ms.length >= 2) {
    const a = ms[0], b = ms[ms.length - 1];
    const last = new Date(2001, b.m + 1, 0).getDate();
    return { fran: `${pad(a.m + 1)}-${pad(a.day || 1)}`, till: `${pad(b.m + 1)}-${pad(b.day || last)}` };
  }
  return { fran: null, till: null };
}
