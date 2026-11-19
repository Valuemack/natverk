// Hämtar kedjornas publicerade LISTPRISER (inkl. moms) -> data/raw/priser.json och data/listpriser.json.
// Obs: ingen kedja publicerar längre pumppris per station för privatkunder (Circle K och Preem skriver
// uttryckligen att aktuellt pris finns på prisskylten). Listpriserna är kedjornas riktpris för
// företagskort (OKQ8, Circle K, Preem) och duger för "dagens bensinpris" som nationell nivå – inte som stationspris.
// Kan köras flera gånger per dygn: node scripts/fetch-priser.mjs (3 anrop, 3 olika domäner).
import path from 'node:path';
import { politeGet, runFetcher, writeJSON, readJSON, robotsSummary, RAW, DATA, nowIso, today } from './lib.mjs';

const num = (t) => { const m = String(t).replace(/\s/g, '').match(/(\d+[,.]\d+)/); return m ? +m[1].replace(',', '.') : null; };
function key(name) {
  const n = name.toLowerCase();
  if (/adblue/.test(n)) return 'adblue';
  if (/alkylat/.test(n)) return /2t/.test(n) ? 'alkylat_2t' : 'alkylat_4t';
  if (/hvo/.test(n)) return 'hvo100';
  if (/e85|etanol/.test(n)) return 'e85';
  if (/gas|cbg/.test(n)) return 'biogas';
  if (/diesel/.test(n)) return /extra|\+|plus|acp/.test(n) ? 'diesel_premium' : 'diesel';
  if (/98/.test(n)) return /extra|\+|plus/.test(n) ? 'bensin98_premium' : 'bensin98';
  if (/95/.test(n)) return 'bensin95';
  return null;
}
function add(out, name, pris, datum, enhet = 'kr/l') {
  const k = key(name); if (!k || pris == null || out[k]) return;
  out[k] = { pris, enhet: /kg/.test(enhet) ? 'kr/kg' : 'kr/l', galler_fran: (String(datum || '').match(/\d{4}-\d{2}-\d{2}/) || [null])[0], produkt: name.trim() };
}

async function okq8() {
  const html = await politeGet('https://www.okq8.se/foretag/priser/');
  const i = html.indexOf('window.__APP_INIT_DATA__ = '); const j = html.indexOf('</script>', i);
  const d = JSON.parse(html.slice(i + 27, j).trim().replace(/;\s*$/, ''));
  const out = {};
  const blocks = JSON.stringify(d.currentPage);
  for (const b of d.currentPage?.informationArea || []) {
    if (!/drivmedel på station/i.test(b.content?.heading || '')) continue;
    for (const r of b.content.itemsRow || []) add(out, r.title, num(r.cells?.[0]?.text), r.cells?.[2]?.text, r.cells?.[0]?.text);
  }
  if (!Object.keys(out).length) throw new Error('hittade ingen pristabell' + (blocks.length ? '' : ''));
  return { kedja: 'OKQ8', url: 'https://www.okq8.se/foretag/priser/', pristyp: 'Företagspris (listpris) inkl. moms, gäller OKQ8-stationer', priser: out };
}
async function circlek() {
  const html = await politeGet('https://www.circlek.se/foretag/drivmedel/priser');
  const k = html.indexOf('<table'); if (k < 0) throw new Error('ingen tabell');
  const t = html.slice(k, html.indexOf('</table>', k)).replace(/<[^>]+>/g, '|').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = {};
  // Mobilvyns celler: "Produktnamn:" värde "Pris:" värde "Ändringsdatum:" värde "Enhet:" värde
  const tok = t.split('|').map((x) => x.trim()).filter(Boolean);
  let cur = null;
  for (let i = 0; i < tok.length - 1; i++) {
    const lab = tok[i], val = tok[i + 1];
    if (lab === 'Produktnamn:') cur = { namn: val };
    else if (cur && lab === 'Pris:') cur.pris = num(val);
    else if (cur && lab === 'Ändringsdatum:') cur.datum = val;
    else if (cur && lab === 'Enhet:') { add(out, cur.namn, cur.pris, cur.datum, val); cur = null; }
  }
  if (!Object.keys(out).length) throw new Error('kunde inte tolka pristabellen');
  return { kedja: 'Circle K', url: 'https://www.circlek.se/foretag/drivmedel/priser', pristyp: 'Listpris företag inkl. moms', priser: out };
}
async function preem() {
  const d = await politeGet('https://www.preem.se/page-data/foretag/listpriser/page-data.json', { as: 'json' });
  const blocks = d.result?.data?.datoCmsArticlePageContent?.articleContent?.blocks || [];
  const out = {};
  // De första tabellerna gäller Företagskort/Transportkort (lätt trafik); truckkortstabellen kommer efter rubriken "Truckkort".
  for (const b of blocks.slice(0, 4)) {
    let tb; try { tb = JSON.parse(b.tableBlock?.table || 'null'); } catch { continue; }
    if (!tb?.columns) continue;
    const [nameCol] = tb.columns; const prisCol = tb.columns.find((c) => /pris/i.test(c)); const datCol = tb.columns.find((c) => /gäller|datum/i.test(c));
    for (const r of tb.data || []) add(out, r[nameCol], num(r[prisCol]), r[datCol], r[prisCol]);
  }
  if (!Object.keys(out).length) throw new Error('kunde inte tolka Preems listpriser');
  return { kedja: 'Preem', url: 'https://www.preem.se/foretag/listpriser/', pristyp: 'Listpris Preem Företagskort inkl. moms', priser: out };
}

await runFetcher('priser', async () => {
  const res = []; const fel = [];
  for (const [n, f] of Object.entries({ okq8, circlek, preem })) {
    try { res.push({ ...(await f()), hamtad: nowIso() }); } catch (e) { fel.push({ kalla: n, fel: e.message }); }
  }
  if (!res.length) throw new Error('inga listpriser: ' + fel.map((x) => `${x.kalla}: ${x.fel}`).join('; '));
  const prev = readJSON(path.join(DATA, 'listpriser.json'));
  // Behåll föregående kedjedata om en källa föll bort denna gång.
  for (const p of prev?.kedjor || []) if (!res.some((r) => r.kedja === p.kedja)) res.push({ ...p, inaktuell: true });
  const snitt = {};
  for (const k of ['bensin95', 'bensin98', 'diesel', 'hvo100', 'e85', 'biogas']) {
    const v = res.filter((r) => !r.inaktuell).map((r) => r.priser[k]?.pris).filter((x) => x != null);
    if (v.length) snitt[k] = { pris: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, antal_kedjor: v.length, min: Math.min(...v), max: Math.max(...v) };
  }
  const outFile = { uppdaterad: nowIso(), datum: today(), not: 'Kedjornas publicerade listpriser (företag) inkl. moms. Pumppriset på enskild station kan avvika (lokal prissättning).', snitt, kedjor: res, fel };
  writeJSON(path.join(DATA, 'listpriser.json'), outFile);
  return { priser: res, fel };
});
const rb = path.join(RAW, 'robots.json');
writeJSON(rb, { ...(readJSON(rb, {})), ...robotsSummary(), _uppdaterad: nowIso() });
