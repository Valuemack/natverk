// Shared helpers for the apoteken data pipeline (no dependencies, Node >= 20).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RAW = path.join(ROOT, 'data', 'raw');
export const DATA = path.join(ROOT, 'data');
fs.mkdirSync(RAW, { recursive: true });

// Generic UA, no personal info.
export const UA = 'Mozilla/5.0 (compatible; apotek-dataset/1.0)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
/** fetch with a global >= 1.1 s spacing between requests, retries and timeout. */
export async function politeFetch(url, opts = {}, { retries = 2, timeoutMs = 60000, minGapMs = 1100 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE,sv;q=0.9', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
}

export function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 1), 'utf8');
}
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Swedish public holidays and "aftnar" (days pharmacies often keep special hours), as { 'YYYY-MM-DD': name }.
export function svHolidays(year) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const day = (m, d) => new Date(Date.UTC(year, m - 1, d));
  const add = (d, n) => new Date(d.getTime() + n * 86400000);
  // Easter Sunday (anonymous Gregorian algorithm)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = day(Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  const firstDow = (m, from, to, dow) => { for (let x = from; x <= to; x++) { const t = day(m, x); if (t.getUTCDay() === dow) return t; } };
  const midsommardagen = firstDow(6, 20, 26, 6);
  const allaHelgons = [day(10, 31), ...[1, 2, 3, 4, 5, 6].map((x) => day(11, x))].find((t) => t.getUTCDay() === 6);
  const out = {
    [iso(day(1, 1))]: 'Nyårsdagen', [iso(day(1, 5))]: 'Trettondagsafton', [iso(day(1, 6))]: 'Trettondedag jul',
    [iso(add(easter, -3))]: 'Skärtorsdagen', [iso(add(easter, -2))]: 'Långfredagen', [iso(add(easter, -1))]: 'Påskafton',
    [iso(easter)]: 'Påskdagen', [iso(add(easter, 1))]: 'Annandag påsk', [iso(day(4, 30))]: 'Valborgsmässoafton',
    [iso(day(5, 1))]: 'Första maj', [iso(add(easter, 39))]: 'Kristi himmelsfärdsdag', [iso(add(easter, 49))]: 'Pingstdagen',
    [iso(day(6, 6))]: 'Sveriges nationaldag', [iso(add(midsommardagen, -1))]: 'Midsommarafton', [iso(midsommardagen)]: 'Midsommardagen',
    [iso(add(allaHelgons, -1))]: 'Allhelgonaafton', [iso(allaHelgons)]: 'Alla helgons dag',
    [iso(day(12, 24))]: 'Julafton', [iso(day(12, 25))]: 'Juldagen', [iso(day(12, 26))]: 'Annandag jul', [iso(day(12, 31))]: 'Nyårsafton',
  };
  return out;
}
