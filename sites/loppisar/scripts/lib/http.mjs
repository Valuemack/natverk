// Shared polite HTTP helper: max 1 request/second per process, generic UA, retries.
// No personal info in the User-Agent.
export const UA = 'Mozilla/5.0 (compatible; secondhand-dataset/1.0; +nightly open-data import)';

let last = 0;
const MIN_GAP_MS = 1100;

async function gap() {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
}

export async function get(url, { type = 'text', headers = {}, retries = 2, timeoutMs = 30000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await gap();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE,sv;q=0.9', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        // Do not retry client errors (403/404 etc.) - respect blocks.
        if (res.status < 500 || attempt >= retries) throw err;
      } else {
        return type === 'json' ? await res.json() : await res.text();
      }
    } catch (e) {
      if (e.status && e.status < 500) throw e;
      if (attempt >= retries) throw e;
    }
    await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
  }
}

/** Fetch robots.txt and return a function allowed(path) for User-agent: * (simple prefix/wildcard rules). */
export async function robots(origin) {
  let txt = '';
  try { txt = await get(origin + '/robots.txt', { retries: 0 }); } catch { return () => true; }
  const rules = [];
  let applies = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') applies = v === '*';
    else if (applies && v) rules.push({ allow: k === 'allow', re: new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')) });
  }
  return (path) => {
    let best = null;
    for (const r of rules) if (r.re.test(path) && (!best || r.re.source.length > best.re.source.length)) best = r;
    return !best || best.allow;
  };
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
