// Fact parsers for Swedish swimming-hall pages: opening hours, prices, pools, facilities, address, phone.
// Input is the line list from lib.htmlToLines (table rows are "cell | cell | cell").
import { DAYS } from './lib.mjs';

export const strip = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ------------------------------------------------------------------ time spans
const MON = 'januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|okt|nov|dec';
const SPAN_RE = new RegExp(String.raw`(?:kl\.?\s*)?(?<![\d.:,])(2[0-4]|[01]?\d)(?:[.:]([0-5]\d))?(?!\d)\s*(?:-|–|—|−|till|to)\s*(?:kl\.?\s*)?(2[0-4]|[01]?\d)(?:[.:]([0-5]\d))?(?![\d,])(?!\s*(?:år|kr|:-|kronor|%|m\b|meter|grader|°|personer|st\b|cm|min|minuter|(?:${MON})\b))`, 'gi');
function pad(h, m) { return `${String(h).padStart(2, '0')}:${m || '00'}`; }
export function parseSpans(text, { strict = false } = {}) {
  const out = [];
  for (const m of text.matchAll(SPAN_RE)) {
    const [, h1, m1, h2, m2] = m;
    if (strict && !m1 && !m2 && !/kl/i.test(m[0])) continue;
    const a = Number(h1) * 60 + Number(m1 || 0), b = Number(h2) * 60 + Number(m2 || 0);
    if (Number(h1) > 24 || Number(h2) > 24) continue;
    if (!(b > a || b === 0)) continue;
    if (b - a < 20 && b !== 0) continue;
    // a bare "3-17" without minutes is very likely an age range unless the context says otherwise
    if (!m1 && !m2 && Number(h1) < 5 && Number(h2) < 20) continue;
    out.push(`${pad(h1, m1)}-${h2 === '24' ? '24:00' : pad(h2, m2)}`);
  }
  return out;
}

// ------------------------------------------------------------------ day specs
const DAY_WORDS = [
  ['mon', /^(mandag(ar|en)?|man|ma)$/], ['tue', /^(tisdag(ar|en)?|tis|ti)$/], ['wed', /^(onsdag(ar|en)?|ons|on)$/],
  ['thu', /^(torsdag(ar|en)?|tors|tor|to)$/], ['fri', /^(fredag(ar|en)?|fre|fr)$/], ['sat', /^(lordag(ar|en)?|lor|lo)$/],
  ['sun', /^(sondag(ar|en)?|son|so)$/],
];
const dayIdx = (w) => { for (let i = 0; i < 7; i++) if (DAY_WORDS[i][1].test(w)) return i; return -1; };
const DAYTOK = String.raw`(?:mandag(?:ar|en)?|tisdag(?:ar|en)?|onsdag(?:ar|en)?|torsdag(?:ar|en)?|fredag(?:ar|en)?|lordag(?:ar|en)?|sondag(?:ar|en)?|man|tis|ons|tors|tor|fre|lor|son|ma|ti|on|to|fr|lo|so)\.?`;
const GROUPTOK = String.raw`(?:vardagar|vardag|veckodagar|helger|helgen|helg|alla dagar|alla veckans dagar|dagligen|varje dag|lordag och sondag|lor-son)`;
// A day spec: list/range of day tokens, e.g. "mån–fre", "måndag, onsdag och fredag", "lördag-söndag", "vardagar"
const SPEC_RE = new RegExp(String.raw`^(?:${GROUPTOK}|${DAYTOK}(?:\s*(?:-|–|—|till|t\.?o\.?m\.?|,|&|och|samt|\/)\s*${DAYTOK})*)`, 'i');
function specDays(spec) {
  const s = strip(spec).replace(/\./g, '');
  if (/^(alla dagar|alla veckans dagar|dagligen|varje dag)/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^(vardagar|vardag|veckodagar)/.test(s)) return [0, 1, 2, 3, 4];
  if (/^(helger|helgen|helg|lordag och sondag|lor-son)/.test(s)) return [5, 6];
  const toks = s.split(/\s*(-|–|—|till|tom|t o m|,|&|och|samt|\/)\s*|\s+/).filter(Boolean);
  const days = []; let rangeFrom = null;
  for (const t of toks) {
    if (/^(-|–|—|till|tom)$/.test(t)) { rangeFrom = days.length ? days[days.length - 1] : null; continue; }
    const i = dayIdx(t); if (i < 0) continue;
    if (rangeFrom !== null) { for (let d = rangeFrom + 1; d <= i; d++) days.push(d); rangeFrom = null; } else days.push(i);
  }
  return [...new Set(days)];
}
// Parse one line into [{days:[..], value:"06:00-21:00"|"stängt"}]. Handles several specs per line.
export function parseDayLine(line) {
  let s = strip(line).replace(/^[\s\-•*·|]+/, '').replace(/\s*\|\s*/g, ' | ')
    .replace(/-\s*,/g, ',').replace(/-\s+(och|samt)\s/g, ' $1 ').replace(/\s*(,|och|samt)\s*(helgdag(ar)?|helgdagsafton|rod dag|roda dagar)\b/g, '');
  const out = [];
  let guard = 0;
  while (s && guard++ < 8) {
    const m = s.match(SPEC_RE);
    if (!m || !m[0].trim()) break;
    const spec = m[0];
    // short tokens (ma, ti, on, to, fr...) only when followed by a separator/time, to avoid prose
    const days = specDays(spec);
    if (!days.length) break;
    let rest = s.slice(spec.length);
    if (!/^\s*(:|\||–|-|\s|\d|kl|stangt|$)/.test(rest)) break;
    rest = rest.replace(/^\s*(?:\bkl\.?|:|\||\s)*/, '');
    // value until the next day spec
    let cut = rest.length;
    const re = new RegExp(String.raw`(?:^|[\s,;|])(?=(?:${GROUPTOK}|${DAYTOK})(?:\s*(?:-|–|till|,|och)\s*${DAYTOK})*\s*(?::|\||\d|kl|stangt))`, 'g');
    for (const mm of rest.matchAll(re)) { if (mm.index > 0) { cut = mm.index; break; } }
    const val = rest.slice(0, cut); s = rest.slice(cut).replace(/^[\s,;|]+/, '');
    const spans = parseSpans(val);
    if (spans.length) out.push({ days, value: spans.join(','), raw: val.trim() });
    else if (/^\s*(stangt|stangd|ingen|inga|-|–)\b/.test(val) || /^\s*stangt/.test(val)) out.push({ days, value: 'stängt', raw: val.trim() });
    else if (!val.trim()) out.push({ days, value: null, raw: '' }); // value may be on the next line
    else break;
  }
  return out;
}

// ------------------------------------------------------------------ hours blocks
const EXCEPT_RE = new RegExp(String.raw`(jul|nyar|trettond|pask|sommar|midsommar|lov\b|sportlov|hostlov|jullov|paasklov|helgdag|roda dagar|avvikande|andrade|tillfallig|undantag|stangt for|stangd for|renovering|underhall|vecka \d|\bv\.? ?\d{1,2}\b|\b\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s*(?:${MON})\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}\/\d{1,2}\b|valborg|kristi|pingst|nationaldag|allhelgon|alla helgons|annandag|afton|ombyggnad|stangning)`);
// Season labels: today is used to decide whether a seasonal block is current.
export function seasonOk(label, date = new Date()) {
  const m = date.getMonth() + 1; const s = strip(label);
  if (/sommar/.test(s)) return m >= 6 && m <= 8;
  if (/(vinter|host|var)(en|terminen|tid|oppet|säsong|sasong)?\b/.test(s) && /(oppettid|tider|sasong|termin)/.test(s)) {
    if (/sommar/.test(s)) return false;
    return m <= 5 || m >= 9;
  }
  return true;
}
export function classifyPart(label) {
  const s = strip(label);
  if (/(reception|kassa|entre(n)?\b)/.test(s) && !/bad|sim/.test(s)) return 'reception';
  if (/(cafe|kafe|cafeteria|restaurang|servering|kiosk|butik|shop)/.test(s)) return 'skip';
  if (/(telefon|kontor|kundtjanst|kundservice|personal|instruktor|aufguss|bokning|simskol|vattengym|vattengympa|kurs|grupptraning|pass\b|schema|forening|skol(sim|or)?\b|tavling|traningsgrupp|bebisgym)/.test(s)) return 'skip';
  if (/(aventyr|lekbad|familjebad|upplevelse|lek i|lekland|rutschkan|vagbad|tropi)/.test(s)) return 'aventyrsbad';
  if (/(varm|terapi|rehab|intygsbad)/.test(s)) return 'varmbassang';
  if (/(relax|spa\b|bastu|wellness|friskvard)/.test(s)) return 'relax';
  if (/(gym|traning|styrketran)/.test(s) && !/(bad|sim)/.test(s)) return 'gym';
  if (/(utomhus|utebad|utebassang|friluft)/.test(s)) return 'utomhus';
  if (/(hopp|svikt|simhopp)/.test(s)) return 'hopp';
  if (/(motionssim|motionsbad|motionsbassang)/.test(s)) return 'motionsbad';
  if (/(undervisning|barnbassang|smabarn|baby|plask)/.test(s)) return 'undervisning';
  if (/(motionssim|motionsbad|simhall|bad(et)?\b|bada|allmanhet|bad och gym|ordinarie|oppettider|simning|\d{2}[- ]?m(eter)?|stora bassang|anlaggning|badhus|simbad|bassang)/.test(s)) return 'motionsbad';
  return 'okand';
}
const isHeading = (l) => l.length <= 70 && !/[.!]$/.test(l.trim()) && !/(vänligen|scrolla|klicka|läs mer|se nedan|här hittar)/i.test(l) && !parseSpans(l).length && !parseDayLine(l).length && !/\d{2,}\s*(kr|kronor)/i.test(l);

// Returns [{label, context, part, exceptional, week:{mon..sun}}]
export function parseHoursBlocks(lines, date = new Date()) {
  const blocks = [];
  const headings = []; // recent headings
  let cur = null; let pendingDays = null;
  const flush = () => { if (cur && Object.keys(cur.week).length) blocks.push(cur); cur = null; };
  const ctxLabel = () => headings.slice(-3).join(' / ');
  const startBlock = (label) => {
    const context = ctxLabel();
    cur = { label: label || headings[headings.length - 1] || '', context, week: {} };
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.includes('|') ? line.split('|').map((c) => c.trim()) : null;

    // (A) table header with part labels, rows start with a day: "| Motionssim | Lek | Café" + "Måndag | t | t | t"
    if (cells && cells.length >= 2 && !parseSpans(line).length) {
      const isDayHeader = cells.filter((c) => c && specDays(c).length === 1 && SPEC_RE.test(strip(c))).length >= 3;
      if (isDayHeader) {
        // (B) transposed: header = days, rows = parts
        const dayCols = cells.map((c) => { const d = SPEC_RE.test(strip(c)) ? specDays(c) : []; return d.length === 1 ? d[0] : null; });
        flush();
        let j = i + 1;
        for (; j < lines.length && lines[j].includes('|'); j++) {
          const rc = lines[j].split('|').map((c) => c.trim());
          const label = rc[0]; const week = {};
          rc.forEach((c, k) => { if (dayCols[k] === null || dayCols[k] === undefined || k === 0 && dayCols[0] === null) return; const sp = parseSpans(c); week[DAYS[dayCols[k]]] = sp.length ? sp.join(',') : /stang/i.test(strip(c)) || /^[-–]$/.test(c) ? 'stängt' : null; });
          for (const d of Object.keys(week)) if (week[d] === null) delete week[d];
          if (Object.keys(week).length) blocks.push({ label, context: ctxLabel(), week, table: 'transposed' });
        }
        i = j - 1; continue;
      }
      const next = lines[i + 1] || '';
      const nextCells = next.split('|');
      if (nextCells.length === cells.length && parseDayLine(nextCells[0]).length && cells.slice(1).some((c) => c && !parseSpans(c).length)) {
        flush();
        const parts = cells.map(() => ({}));
        let j = i + 1;
        for (; j < lines.length && lines[j].includes('|'); j++) {
          const rc = lines[j].split('|').map((c) => c.trim());
          const dl = parseDayLine(rc[0] + ' 00.00-00.01'); // only to read the day spec
          const days = dl.length ? dl[0].days : specDays(rc[0]);
          if (!days.length) break;
          for (let k = 1; k < rc.length; k++) {
            const sp = parseSpans(rc[k]); const v = sp.length ? sp.join(',') : /stang|^[-–]$/.test(strip(rc[k])) ? 'stängt' : null;
            if (v) for (const d of days) parts[k][DAYS[d]] = v;
          }
        }
        for (let k = 1; k < cells.length; k++) if (Object.keys(parts[k]).length) blocks.push({ label: cells[k], context: ctxLabel(), week: parts[k], table: 'columns' });
        i = j - 1; continue;
      }
    }

    // (B2) Medley style: a label followed by exactly 7 spans/stängt, after a line listing the weekdays
    const spansAll = [...line.matchAll(/(\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}|stängt|stangt)/gi)].map((m) => m[0]);
    if (spansAll.length === 7 && !parseDayLine(line).length) {
      const label = line.replace(/(\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}|stängt|stangt)/gi, '').replace(/[|]/g, ' ').trim();
      const recent = lines.slice(Math.max(0, i - 8), i).map(strip).join(' ');
      if (/mandag/.test(recent) && /sondag/.test(recent)) {
        flush();
        const week = {}; spansAll.forEach((v, k) => { week[DAYS[k]] = /st/i.test(v) ? 'stängt' : parseSpans(v)[0] || null; });
        if (Object.values(week).every(Boolean)) blocks.push({ label, context: ctxLabel(), week, table: 'rows7' });
        continue;
      }
    }

    // (C) day lines
    let dl = parseDayLine(line);
    if (dl.length) {
      // (D) day spec alone; times on the following line(s)
      if (dl.every((x) => x.value === null)) {
        const nxt = lines[i + 1] || '';
        const sp = parseSpans(nxt);
        if (sp.length && !parseDayLine(nxt).length && nxt.length < 60) { dl = dl.map((x) => ({ ...x, value: sp.join(',') })); i++; }
        else if (/^stang/i.test(strip(nxt))) { dl = dl.map((x) => ({ ...x, value: 'stängt' })); i++; }
        else { pendingDays = dl; continue; }
      }
      if (!cur) startBlock();
      for (const x of dl) if (x.value) for (const d of x.days) {
        const k = DAYS[d];
        // same day listed twice in one block = new block (e.g. two parts listed one after another without headings)
        if (cur.week[k] && cur._last !== line && cur.week[k] !== x.value && cur.days === 7) { flush(); startBlock(); }
        cur.week[k] = x.value;
      }
      cur._last = line; cur.days = Object.keys(cur.week).length;
      continue;
    }
    pendingDays = null;
    // a short line with only times right after a block = continuation (second interval); ignore
    if (cur && parseSpans(line).length) continue; // note/holiday line with times inside a block
    if (cur && /^(obs|\*|\(|observera|notera|ps\b)/i.test(line.trim()) && parseDayLine(lines[i + 1] || '').length) continue;
    if (cur) flush();
    if (isHeading(line)) { headings.push(line); if (headings.length > 6) headings.shift(); }
  }
  flush();
  for (const b of blocks) {
    delete b._last; delete b.days;
    const lab = `${b.context} / ${b.label}`;
    b.part = classifyPart(b.label) !== 'okand' ? classifyPart(b.label) : classifyPart(b.context.split(' / ').slice(-1)[0] || '');
    const near = [b.label, ...b.context.split(' / ').slice(-2)].map(strip);
    const ordinarie = near.some((x) => /(ordinarie|vanliga|normala|ordinare)/.test(x));
    b.exceptional = !ordinarie && (EXCEPT_RE.test(near[0]) || EXCEPT_RE.test(near[near.length - 1]) || !seasonOk(lab, date));
    b.ndays = Object.keys(b.week).length;
  }
  return blocks;
}
export function fullWeek(week) {
  const n = Object.keys(week).length; if (n < 5) return null;
  const w = {}; for (const d of DAYS) w[d] = week[d] || 'stängt';
  return w;
}

// ------------------------------------------------------------------ prices
const PRICE_RE = /(\d{1,4})(?:[,.](?:00|-))?\s*(?:kr\b|kronor|:-|sek\b)/i;
const PRICE_SKIP = /(klipp|kort\b|kortet|kort |arskort|ars|manad|period|termin|sasong|abonnemang|medlem|autogiro|\d+\s*ggr|\d+\s*besok|\d+-kort|hyr|hyra|kurs|simskola|babysim|kalas|lektion|handduk|las\b|hanglas|deposition|guld|gym|grupptraning|solarium|parkering|personlig|vattengym|skolsim|forening|banhyra|bana\b|privat|lokal|presentkort|tillagg|kvall|lunch|frukost|ledsagare|massage|behandling|bastuflotte|bastu(?!.*bad)|relax|spa\b|friskvard|seniorsim)/;
const CATS = [
  ['familj', /familj/],
  ['pensionar', /(pensionar|senior|65\+|ålderspension|alderspension|fyllt 65|over 65|65 ar)/],
  ['student', /(student|studerande)/],
  ['barn', /(barn|ungdom|junior|ungdomar|\b\d{1,2}\s*[-–]\s*1[2-9]\s*ar|under 1[2-9]\s*ar|\bunga\b)/],
  ['vuxen', /(vuxn?(a|en)?\b|vuxen|vuxna|\bvux\b|over 1[6-9] ar|fran 1[6-9] ar|20 ar och aldre|18 ar och aldre)/],
];
const RANGE = { vuxen: [20, 350], barn: [0, 250], pensionar: [0, 300], student: [10, 300], familj: [50, 900] };
export function parsePrices(lines) {
  const res = {}; const raw = {}; let section = ''; let sectionSkip = false; let prevLabel = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const s = strip(line);
    const hasPrice = PRICE_RE.test(line) || /\bgratis\b|fri entre|\b0 kr/.test(s);
    if (!hasPrice) {
      if (line.length <= 70) {
        // a heading or a label line
        const isLabel = CATS.some(([, re]) => re.test(s)) && line.length < 70;
        if (isLabel) prevLabel = line;
        else { section = s; sectionSkip = PRICE_SKIP.test(s) && !/(engang|entre|enstaka|bad\b|badentre)/.test(s); prevLabel = null; }
      } else prevLabel = null;
      continue;
    }
    if (sectionSkip) { prevLabel = null; continue; }
    // split "Vuxen 70 kr, barn 35 kr" into chunks; for table rows use the first two cells
    let chunks;
    if (line.includes(' | ')) { const c = line.split(' | '); chunks = [c[0] + ' ' + (c.slice(1).find((x) => PRICE_RE.test(x) || /gratis/i.test(x)) || '')]; }
    else chunks = line.split(/[;,]\s*(?=[A-ZÅÄÖa-zåäö])|\s+[–-]\s+(?=[A-ZÅÄÖ])/);
    for (let ch of chunks) {
      let cs = strip(ch);
      if (!CATS.some(([, re]) => re.test(cs)) && prevLabel) { ch = prevLabel + ' ' + ch; cs = strip(ch); }
      if (PRICE_SKIP.test(cs.replace(/bad och gym/, ''))) continue;
      const pm = ch.match(PRICE_RE); const free = !pm && /\bgratis\b|fri entre/.test(cs);
      if (!pm && !free) continue;
      const val = pm ? Number(pm[1]) : 0;
      // the label is the text before the price
      const labelPart = pm ? strip(ch.slice(0, pm.index)) : cs;
      const order = CATS.map(([cat, re]) => { const m = labelPart.match(re); return m ? [cat, re, m.index] : null; }).filter(Boolean).sort((a, b) => a[2] - b[2]);
      for (const [cat, re] of order) {
        if (cat === 'barn' && /vuxen/.test(labelPart) && !/barn/.test(labelPart.split('vuxen')[0])) continue;
        const [lo, hi] = RANGE[cat]; if (val < lo || val > hi) break;
        if (res[cat] === undefined || (res[cat] === 0 && val > 0 && (cat === 'barn' || cat === 'pensionar'))) { res[cat] = val; raw[cat] = ch.trim().slice(0, 120); }
        break;
      }
    }
    prevLabel = null;
  }
  return Object.keys(res).length ? { ...res, _raw: raw } : null;
}

// ------------------------------------------------------------------ pools
const POOL_NAME_RE = /(\b\d{2}(?:[.,]\d)?\s*-?\s*(?:m|meter|meters)\s*-?\s*(?:bassang(?:en)?|hall(?:en)?|pool)|\b\d{2}-?metersbassang(?:en)?|\b\d{2}-?metershall(?:en)?|motionsbassang(?:en)?|tavlingsbassang(?:en)?|undervisningsbassang(?:en)?|traningsbassang(?:en)?|barnbassang(?:en)?|smabarnsbassang(?:en)?|babybassang(?:en)?|plaskbassang(?:en)?|lekbassang(?:en)?|varmvattenbassang(?:en)?|varmbassang(?:en)?|terapibassang(?:en)?|rehabbassang(?:en)?|hoppbassang(?:en)?|aventyrsbassang(?:en)?|upplevelsebassang(?:en)?|vagbassang(?:en)?|relaxbassang(?:en)?|utomhusbassang(?:en)?|utebassang(?:en)?|bubbelpool(?:en)?|spabad(?:et)?|jacuzzi|stora bassangen|lilla bassangen|simbassang(?:en)?|bassang \d)/;
const POOL_LABEL = (m) => {
  const s = m.replace(/en$/, '').replace(/\s+/g, ' ');
  const lm = s.match(/(\d{2})(?:[.,]\d)?\s*-?\s*(?:m|meter|meters)/);
  if (lm && /bassang|hall|pool/.test(s)) return `${lm[1]}-metersbassäng`;
  const map = { motionsbassang: 'Motionsbassäng', tavlingsbassang: 'Tävlingsbassäng', undervisningsbassang: 'Undervisningsbassäng', traningsbassang: 'Träningsbassäng', barnbassang: 'Barnbassäng', smabarnsbassang: 'Småbarnsbassäng', babybassang: 'Babybassäng', plaskbassang: 'Plaskbassäng', lekbassang: 'Lekbassäng', varmvattenbassang: 'Varmvattenbassäng', varmbassang: 'Varmvattenbassäng', terapibassang: 'Terapibassäng', rehabbassang: 'Rehabbassäng', hoppbassang: 'Hoppbassäng', aventyrsbassang: 'Äventyrsbassäng', upplevelsebassang: 'Upplevelsebassäng', vagbassang: 'Vågbassäng', relaxbassang: 'Relaxbassäng', utomhusbassang: 'Utomhusbassäng', utebassang: 'Utomhusbassäng', bubbelpool: 'Bubbelpool', spabad: 'Spabad', jacuzzi: 'Bubbelpool', 'stora bassang': 'Stora bassängen', 'lilla bassang': 'Lilla bassängen', simbassang: 'Simbassäng' };
  for (const [k, v] of Object.entries(map)) if (s.startsWith(k) || s.includes(k)) return v;
  return null;
};
function poolAttrs(text) {
  const s = strip(text); const a = {};
  const lm = s.match(/(?:langd|lang)\s*:?\s*(\d{1,2})(?:[.,]\d+)?\s*(?:m|meter)\b/) || s.match(/\b(\d{2})(?:[.,]\d)?\s*-?\s*(?:m\b|meter)(?!\s*(?:djup|bred|hog|lang\s+rutsch))/);
  if (lm && !/(djup|bredd)\s*:?\s*$/.test(s.slice(0, lm.index))) { const v = Number(lm[1]); if (v >= 8 && v <= 51) a.langd_m = v; }
  const bm = s.match(/\b(\d{1,2})\s*(?:st\.?\s*)?(?:simbanor|banor|motionsbanor|50-?metersbanor|25-?metersbanor)\b/) || s.match(/\bbanor\s*:?\s*(\d{1,2})\b/);
  if (bm) { const v = Number(bm[1]); if (v >= 2 && v <= 12) a.banor = v; }
  const tm = s.match(/(\d{2}(?:[.,]\d)?)\s*(?:°|grader|gr\b|degrees)/) || s.match(/temperatur\w*\s*:?\s*(?:ca\.?|cirka|ungefar)?\s*(\d{2}(?:[.,]\d)?)/);
  if (tm) { const v = Number(tm[1].replace(',', '.')); if (v >= 18 && v <= 40) a.temp_c = v; }
  return a;
}
export function parsePools(lines) {
  const pools = new Map();
  for (let i = 0; i < lines.length; i++) {
    const s = strip(lines[i]);
    if (s.length > 400) continue;
    const ms = [...s.matchAll(new RegExp(POOL_NAME_RE.source, 'g'))];
    if (!ms.length) continue;
    if (/(badplats|strand|hotell|camping|annan simhall|narmaste)/.test(s)) continue;
    // attributes: this line, and following short attribute lines (Längd: / Temperatur: / banor) until next pool name
    let text = lines[i];
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) {
      const sj = strip(lines[j]);
      if (POOL_NAME_RE.test(sj) || sj.length > 160) break;
      if (/(langd|temperatur|grader|°|banor|djup|bredd|\bm\b|meter)/.test(sj)) text += ' ; ' + lines[j];
    }
    if (ms.length > 1 && s.length > 60) {
      // several pools in one sentence: split at pool names
      const idx = ms.map((m) => m.index).concat([s.length]);
      for (let k = 0; k < ms.length; k++) {
        const name = POOL_LABEL(ms[k][0]); if (!name) continue;
        const seg = s.slice(Math.max(0, k ? idx[k] : idx[k] - 40), idx[k + 1]);
        add(pools, name, poolAttrs(seg), ms[k][0]);
      }
    } else {
      const name = POOL_LABEL(ms[0][0]); if (!name) continue;
      const attrs = poolAttrs(text);
      const lm = ms[0][0].match(/(\d{2})/); if (lm && /\d{2}\s*-?\s*(m|meter)/.test(ms[0][0])) attrs.langd_m = Number(lm[1]);
      add(pools, name, attrs, ms[0][0]);
    }
  }
  const out = [...pools.values()].filter((p) => p.namn).slice(0, 12);
  return out.length ? out : null;
}
function add(pools, name, attrs, src) {
  if (/metersbassang/.test(strip(name)) && attrs.langd_m && !strip(name).startsWith(String(attrs.langd_m))) attrs.langd_m = Number(strip(name).slice(0, 2));
  if (/metersbassäng/.test(name)) attrs.langd_m = Number(name.slice(0, 2));
  if (attrs.langd_m && (attrs.langd_m > 51 || attrs.langd_m < 8)) delete attrs.langd_m;
  const p = pools.get(name) || { namn: name, langd_m: null, banor: null, temp_c: null };
  for (const k of ['langd_m', 'banor', 'temp_c']) if (attrs[k] != null && p[k] == null) p[k] = attrs[k];
  pools.set(name, p);
}

// ------------------------------------------------------------------ facilities
const FAC = {
  bastu: /(bastu|sauna|angbastu|torrbastu)/,
  gym: /(\bgym(met|et)?\b|styrketraning|traningssal)/,
  rutschkana: /(rutschkan|vattenrutsch|rutschbana|slide\b|kamikaze|tornado)/,
  hopptorn: /(hopptorn|hoppbassang|simhopp|svikt|\d\s*-?\s*metersvikt|trampolin(?!park))/,
  babysim: /(babysim|bebissim|baby-sim|minisim|spadbarnssim|smabarnssim|bebisim)/,
  varmbassang: /(varmvattenbassang|varmbassang|varmbad|terapibassang|rehabbassang|varmvatten)/,
  aventyrsbad: /(aventyrsbad|aventyrsbassang|lekbad|vagmaskin|vagbassang|upplevelsebad|lazy river|stromkanal|stromande vatten)/,
  barnbassang: /(barnbassang|plaskbassang|lekbassang|smabarnsbassang|babybassang|undervisningsbassang)/,
  relax: /(\brelax|spa\b|spaavdelning|bubbelpool|jacuzzi|massagebad|angbad|wellness)/,
  utomhusbassang: /(utomhusbassang|utebassang|utomhusbad(?!plats)|uteomrade med bassang)/,
  simskola: /(simskol|simkurs|simundervisning)/,
  vattengympa: /(vattengymp|vattengympa|aquafit|aqua fit|vattentraning|aquagym|vattenjogging)/,
  cafe: /(\bcafe\b|\bkafe\b|cafeteria|cafet\b|kafeteria|servering)/,
  tillganglighet: /(lyft\b|bassanglyft|personlyft|tillganglighetsanpassad|handikappanpassad|rullstolsanpassad|rwc|ramp ner i)/,
  motionssim: /(motionssim|motionsbanor|motionssimning)/,
};
export function parseFacilities(text) {
  const s = strip(text); const out = {};
  for (const [k, re] of Object.entries(FAC)) out[k] = re.test(s) ? true : null;
  return out;
}

// ------------------------------------------------------------------ address & phone
const STREET = String.raw`[A-ZÅÄÖ][A-Za-zÅÄÖåäöéü.\-]+(?:\s[A-ZÅÄÖa-zåäöéü.\-]+){0,3}\s\d{1,4}\s?[A-Za-z]?`;
export function parseAddress(lines, ld = []) {
  for (const n of ld) {
    const a = n.address || (n['@type'] === 'PostalAddress' ? n : null);
    if (a && typeof a === 'object' && (a.streetAddress || a.postalCode)) return { gatuadress: a.streetAddress || null, postnummer: fmtPost(a.postalCode), ort: a.addressLocality || null, kalla: 'jsonld' };
  }
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const lab = s.match(/^(?:besoksadress|besöksadress|adress|gatuadress|hitta hit|här finns vi|har finns vi|adress till \S+)\s*[:|]?\s*(.*)$/i);
    if (!lab) continue;
    let val = lab[1] && lab[1].length > 3 ? lab[1] : (lines[i + 1] || '');
    if (/^box\b|postadress/i.test(val)) continue;
    if (lines[i + 2] && /^\d{3}\s?\d{2}\s+\S/.test(lines[i + 1] || '') === false && /^\d{3}\s?\d{2}\s+\S/.test(lines[i + 2]) && val === lines[i + 1]) val += ', ' + lines[i + 2];
    else if (/^\d{3}\s?\d{2}\s+\S/.test(lines[i + 2] || '') && !/\d{3}\s?\d{2}/.test(val)) val += ', ' + lines[i + 2];
    const r = splitAddr(val); if (r) return { ...r, kalla: 'text' };
  }
  return null;
}
function fmtPost(p) { if (!p) return null; const d = String(p).replace(/\D/g, ''); return d.length === 5 ? `${d.slice(0, 3)} ${d.slice(3)}` : null; }
export function splitAddr(val) {
  val = val.replace(/\s*\|\s*/g, ', ').trim();
  const m = val.match(new RegExp(String.raw`(${STREET})\s*,?\s*(?:(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäöé]+(?:[ -][A-ZÅÄÖa-zåäöé]+)?))?`));
  if (!m) return null;
  if (/^(box|telefon|tel|mobil|org)/i.test(m[1])) return null;
  return { gatuadress: m[1].trim(), postnummer: fmtPost(m[2]), ort: m[3] || null };
}
export function parsePhones(lines, links = []) {
  const out = [];
  for (const l of links) if (/^tel:/i.test(l.url)) out.push(normPhone(decodeURIComponent(l.url.slice(4))));
  for (const s of lines) {
    const m = s.match(/(?:telefon|tel|reception|kassa|ring|kontakt)\S*\s*:?\s*(\+46\s?\d[\d\s-]{6,12}\d|0\d{1,3}[\s-]?\d[\d\s-]{4,10}\d)/i);
    if (m) out.push(normPhone(m[1]));
  }
  return out.filter(Boolean);
}
export function normPhone(p) {
  let d = (p || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+46')) d = '0' + d.slice(3);
  if (!/^0\d{6,10}$/.test(d)) return null;
  // format with area code: 2-digit (08), 3-digit (0xx), else 4-digit
  const ac = d.startsWith('08') ? 2 : /^0(1[013689]|2[0136]|3[1356]|4[0246]|54|6[03]|90)/.test(d) ? 3 : 4;
  const rest = d.slice(ac);
  const grp = rest.length === 7 ? `${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5)}` : rest.length === 6 ? `${rest.slice(0, 2)} ${rest.slice(2, 4)} ${rest.slice(4)}` : rest.length === 5 ? `${rest.slice(0, 3)} ${rest.slice(3)}` : rest.length === 8 ? `${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}` : rest;
  return `${d.slice(0, ac)}-${grp}`;
}

// ------------------------------------------------------------------ deviating hours (holidays, closures)
const DATE_RE = new RegExp(String.raw`(\b\d{1,2}\s*(?:${MON})\b|\b\d{1,2}\/\d{1,2}\b|\d{4}-\d{2}-\d{2}|julafton|juldagen|annandag|nyarsafton|nyarsdagen|trettondag|langfredag|pask|midsommar|valborg|kristi himmelsfard|nationaldagen|alla helgons|jullov|sportlov|hostlov|pasklov|nyarsaftonen|vecka \d{1,2}|\bv\.? ?\d{1,2}\b)`);
const MONTHS = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, mars: 3, apr: 4, april: 4, maj: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, augusti: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12 };
export function parseDeviations(lines, date = new Date()) {
  const out = []; const seen = new Set();
  const cm = date.getMonth() + 1, cd = date.getDate();
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]; const s = strip(l);
    if (l.length > 200 || !DATE_RE.test(s)) continue;
    // merge "24 december" + "9.00–13.00" + "Jullov (julafton)" split across lines
    let full = l;
    if (!parseSpans(l).length && !/stang|oppet/.test(s)) {
      const n1 = lines[i + 1] || '';
      if (parseSpans(n1).length || /^stang/i.test(strip(n1))) { full = `${l} ${n1}`; i++; const n2 = lines[i + 1] || ''; if (n2.length < 40 && !DATE_RE.test(strip(n2)) && !parseSpans(n2).length) { full += ` (${n2})`; i++; } }
      else continue;
    }
    const fs = strip(full);
    if (!parseSpans(full).length && !/(stang|oppet|ordinarie)/.test(fs)) continue;
    if (/(simskola|kurs|anmalan|terminen startar|tavling|vattenpolo|swim|cup|match|sm\b|dm\b|usm|boka|kalas|schema \d)/.test(fs)) continue;
    // drop past dates (same year assumed when no year is given)
    const dm = fs.match(new RegExp(String.raw`\b(\d{1,2})\s*(${MON})\b`));
    if (dm) {
      const mo = MONTHS[dm[2]]; const dd = Number(dm[1]);
      const ym = fs.match(/\b(20\d{2})\b/); const yr = ym ? Number(ym[1]) : null;
      const past = yr ? (yr < date.getFullYear() || (yr === date.getFullYear() && (mo < cm || (mo === cm && dd < cd)))) : (mo < cm || (mo === cm && dd < cd)) && cm - mo < 6;
      if (past) continue;
    }
    const key = fs.replace(/\s+/g, ' ');
    if (seen.has(key)) continue; seen.add(key);
    out.push(full.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim());
    if (out.length >= 20) break;
  }
  return out.length ? out.join('; ') : null;
}
export const CLOSED_RE = /(stangd for (renovering|ombyggnad|underhall)|stangt for (renovering|ombyggnad|underhall)|tillfalligt stangd|tillfalligt stangt|stangd tills vidare|stangt tills vidare|stanger permanent|ar nu stangd|har stangt for gott|rivs)/;

// ------------------------------------------------------------------ name tokens (matching)
export const GENERIC_TOK = new Set(('bad bada baden badet simhall simhallar simhallarna simhallen badhus badhusen badhuset och simning simma simmar inomhusbad utomhusbad ' +
  'idrott idrotts motion fritid fritids uppleva upplev gora kultur trana gymma friluftsliv anlaggningar anlaggning hallar idrottsanlaggningar idrottshallar i pa vara ' +
  'simhallsbad aventyrsbad badanlaggningar motionera sport sporter traning lokaler html en ett for av till med hitta utomhusbassang utomhusbassanger inomhusbassanger ' +
  'priser pris oppettider kontakt om ga se sv kommun kommunen var vart halsa friskvard aktiviteter fritidsanlaggningar ute inne bassang bassanger stadsdel enheter portal ' +
  'wps besoksmal turism evenemang barn unga familj sommar vinter anlaggningen arenor arena simskola simskolor badplatser badplats hallen ishallar ishall sporthallar sporthall ' +
  'idrottsplatser fritidsgardar allmant tillganglighet tillgangligt info information aktuellt bassangschema schema boka bokning hyra kalas gym relax nyheter ' +
  'simhallens badhusets badets simhallarnas printable fakta vanliga fragor regler ordningsregler infor besoket ditt besok kop entre entreer avgifter avgift taxor').split(' '));
export function coreTokens(name) {
  return strip(name).replace(/[^a-z0-9 -]+/g, ' ').split(/[\s-]+/).filter(Boolean)
    .filter((t) => !GENERIC_TOK.has(t) && !/^(sim|och|idrottshall|sporthall|simhallsbad|badanlaggning|centralbadet)$/.test(t))
    .map((t) => { let x = t; for (let i = 0; i < 3; i++) x = x.replace(/(simhallen|simhall|badhuset|badhus|badet|bad|hallen|hall|arena|ens|s)$/, ''); return x; })
    .filter((t) => t.length >= 3);
}

// Page titles that are not hall names
export const NAME_JUNK = /(priser|prislista|trivselregler|regler|höstlov|sportlov|jullov|lovaktivitet|\blov\b|taxa|bygget|byggs|kommunen tar|gymnastiksal|samlingslokal|hitta till|^information|aktuellt|schema|\bht\.|\bvt\.|\b20\d\d\b|simskola|anläggningar|utomhuspooler|^bad och|^bad,|^bad &|& upplevelser|simhall, badhus|renovering|ombyggnad|nyheter|öppnar|stänger|stängt|anmälan|after school|parasimning|simklubb|sällskap|^simhallen$|^badhuset$|^simhall$|^badhus$|\?|!)/i;
