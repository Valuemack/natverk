// Stockholms stad, LTF-Tolken (openparking.stockholm.se): lokala trafikföreskrifter för gatuparkering.
// Publikt åtkomlig utan nyckel; "Datainnehåll i dessa tjänster får vidareutnyttjas fritt och tillhandahållas
// licensfritt om inget annat anges" (openstreetgs.stockholm.se/home). Ett enda anrop (ptillaten/all, ~20 000 linjer).
// Sparas kompakt som linjemittpunkter med taxa -> data/raw/kommun/park-stockholm-ltf.json (roll: avgiftslinjer).
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, fetchText, writeJson, readJson, nowIso } from './lib.mjs';

const file = path.join(RAW_DIR, 'kommun', 'park-stockholm-ltf.json');
const status = readJson(path.join(RAW_DIR, 'kommun-status.json'), {});
if (!process.env.FORCE && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 24 * 3600e3) { console.log('stockholm-ltf: cache'); process.exit(0); }
const url = 'https://openparking.stockholm.se/LTF-Tolken/v1/ptillaten/all?outputFormat=json';
try {
  const { text } = await fetchText(url, { timeoutMs: 600000, retries: 1 });
  const j = JSON.parse(text);
  const features = [];
  for (const f of j.features || []) {
    const p = f.properties || {}; const c = f.geometry?.coordinates; if (!c?.length) continue;
    const pts = f.geometry.type === 'MultiLineString' ? c.flat() : c; const m = pts[Math.floor(pts.length / 2)];
    if (!p.PARKING_RATE) continue;
    features.push({ lat: Math.round(m[1] * 1e6) / 1e6, lon: Math.round(m[0] * 1e6) / 1e6, props: { taxa: p.PARKING_RATE, gata: p.STREET_NAME || null, typ: p.VF_PLATS_TYP || null, omrade: p.PARKING_DISTRICT || null } });
  }
  writeJson(file, { hamtad: nowIso(), url, licens: 'licensfritt (Stockholms stad)', antal: features.length, features }, false);
  status['park-stockholm-ltf'] = { ok: true, antal: features.length, hamtad: nowIso() };
  console.log(`stockholm-ltf: ${features.length} linjer med taxa`);
} catch (e) {
  status['park-stockholm-ltf'] = { ok: false, fel: e.message, hamtad: nowIso() };
  console.warn('stockholm-ltf:', e.message);
}
writeJson(path.join(RAW_DIR, 'kommun-status.json'), status);
