// Gemensamma hjälpfunktioner för api-data-skripten (inga beroenden, Node 18+).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');

// Generisk User-Agent, inga personuppgifter.
export const UA = 'Mozilla/5.0 (compatible; oppna-data-hamtare/1.0)';

// Max 2 anrop per sekund totalt (550 ms mellan anrop), med omförsök vid 429/5xx.
const MIN_INTERVAL_MS = 550;
let last = 0;
async function throttle() {
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function getJson(url, { retries = 4, allow404 = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 404 && allow404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, ra > 0 ? ra * 1000 : 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status} för ${url}`);
  }
}

export async function getText(url) {
  await throttle();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} för ${url}`);
  return res;
}

// enPerRad: en array skrivs med ett kompakt element per rad (mindre fil, fortfarande diff-vänlig).
export async function writeJson(file, data, { enPerRad = false } = {}) {
  await mkdir(dirname(file), { recursive: true });
  // Skriv till temporär fil först så att en avbruten körning inte lämnar halv JSON.
  const tmp = file + '.tmp';
  const text =
    enPerRad && Array.isArray(data)
      ? '[\n' + data.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n'
      : JSON.stringify(data, null, 2) + '\n';
  await writeFile(tmp, text, 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, file);
}

export async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

// Datum (YYYY-MM-DD) i svensk tid för en UTC-tidsstämpel. HaV lagrar t.ex. "2026-08-04T22:00:00Z" = 5 aug lokal tid.
const fmtDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });
export function localDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fmtDate.format(d);
}
export function today() {
  return fmtDate.format(new Date());
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/[öø]/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Länskoder (de två första siffrorna i kommunkoden) -> fullständigt länsnamn.
export const LAN = {
  '01': 'Stockholms län',
  '03': 'Uppsala län',
  '04': 'Södermanlands län',
  '05': 'Östergötlands län',
  '06': 'Jönköpings län',
  '07': 'Kronobergs län',
  '08': 'Kalmar län',
  '09': 'Gotlands län',
  '10': 'Blekinge län',
  '12': 'Skåne län',
  '13': 'Hallands län',
  '14': 'Västra Götalands län',
  '17': 'Värmlands län',
  '18': 'Örebro län',
  '19': 'Västmanlands län',
  '20': 'Dalarnas län',
  '21': 'Gävleborgs län',
  '22': 'Västernorrlands län',
  '23': 'Jämtlands län',
  '24': 'Västerbottens län',
  '25': 'Norrbottens län',
};
