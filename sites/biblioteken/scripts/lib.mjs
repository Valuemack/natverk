// Shared helpers for the biblioteken data pipeline (no dependencies, Node >= 18).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
export const RAW = path.join(DATA, 'raw');
export const UA = 'biblioteken-dataset/1.0 (open-data aggregation; nightly)';

fs.mkdirSync(RAW, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
/** fetch with a global >= minGapMs between requests, retries and timeout. */
export async function politeFetch(url, opts = {}, { minGapMs = 1000, retries = 3, timeoutMs = 120000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= retries) throw new Error(`${url}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJSON = (p, v, pretty = true) =>
  fs.writeFileSync(p, JSON.stringify(v, null, pretty ? 1 : 0) + '\n', 'utf8');
export const exists = (p) => fs.existsSync(p);

/** Normalise strings for fuzzy matching. */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
