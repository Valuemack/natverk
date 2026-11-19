// OPTIONAL: opening hours from municipal library websites, ONLY via structured data (schema.org JSON-LD
// openingHoursSpecification / openingHours). No HTML scraping, no login, no JS execution.
// Rules: robots.txt is honoured (User-agent * and our own token); hosts that set Crawl-delay > 10 s or that
// block AI agents (ClaudeBot/Claude-User/anthropic-ai/GPTBot ...) are skipped and listed in the summary.
// Max 1 request per second overall. Output: data/raw/web-hours.json { summary, hosts, results: { <sigel>: {url, week, raw} } }
import path from 'node:path';
import { politeFetch, readJSON, writeJSON, RAW, UA } from './lib.mjs';
import { DAYS } from './hours.mjs';

const MAX_PAGES = Number(process.env.WEB_MAX_PAGES || 2000);
const AI_AGENTS = /claude|anthropic|gptbot|chatgpt|ccbot|google-extended|perplexity/i;
const libs = readJSON(path.join(RAW, 'bibdb-se.json')).libraries
  .filter((l) => /^folk/.test(l.library_type || '') && l.alive && l.url && /^https?:\/\//.test(l.url));

// ---- robots.txt
function parseRobots(txt) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'disallow' || k === 'allow') cur.rules.push({ allow: k === 'allow', path: v });
    if (k === 'crawl-delay') cur.delay = Number(v);
  }
  return groups;
}
function robotsVerdict(groups, urlPath) {
  const token = 'biblioteken-dataset';
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  const aiBlocked = groups.some((g) => g.agents.some((a) => AI_AGENTS.test(a)) && g.rules.some((r) => !r.allow && r.path === '/'));
  let best = null;
  for (const g of applicable) for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(urlPath) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  const delay = Math.max(0, ...applicable.map((g) => g.delay || 0));
  return { allowed: !best || best.allow, delay, aiBlocked };
}

// ---- JSON-LD extraction
const DAYMAP = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun' };
function extractHours(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let j;
    try { j = JSON.parse(b.trim()); } catch { continue; }
    const nodes = [];
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { nodes.push(x); Object.values(x).forEach(walk); } };
    walk(j);
    for (const n of nodes) {
      const spec = n.openingHoursSpecification;
      if (!spec) continue;
      const week = Object.fromEntries(DAYS.map((d) => [d, null]));
      let any = false;
      for (const s of [].concat(spec)) {
        if (s.validFrom || s.validThrough) continue; // special days
        for (const d of [].concat(s.dayOfWeek || [])) {
          const key = DAYMAP[String(d).split('/').pop().toLowerCase()];
          if (!key || !s.opens || !s.closes) continue;
          const v = `${s.opens.slice(0, 5)}-${s.closes.slice(0, 5)}`;
          week[key] = week[key] ? `${week[key]},${v}` : v;
          any = true;
        }
      }
      if (any) {
        for (const d of DAYS) if (!week[d]) week[d] = 'stängt';
        return { week, raw: JSON.stringify(spec).slice(0, 500) };
      }
    }
  }
  return null;
}

const hosts = {};
const results = {};
let pages = 0;
for (const l of libs) {
  if (pages >= MAX_PAGES) break;
  let u;
  try { u = new URL(l.url); } catch { continue; }
  const h = hosts[u.host] || (hosts[u.host] = { status: null, pages: 0, found: 0 });
  if (h.status === null) {
    try {
      const r = await politeFetch(`${u.protocol}//${u.host}/robots.txt`, {}, { retries: 1, timeoutMs: 20000 });
      h.robots = r.ok ? parseRobots(await r.text()) : [];
      h.status = 'ok';
    } catch (e) { h.status = 'unreachable'; h.error = e.message; }
  }
  if (h.status !== 'ok') continue;
  const v = robotsVerdict(h.robots, u.pathname + u.search);
  if (v.aiBlocked) { h.skipped = 'robots.txt blockerar AI-agenter'; continue; }
  if (v.delay > 10) { h.skipped = `Crawl-delay ${v.delay}s`; continue; }
  if (!v.allowed) { h.skipped = 'robots.txt disallow'; continue; }
  try {
    const res = await politeFetch(u.href, { headers: { Accept: 'text/html' } }, { retries: 1, timeoutMs: 30000, minGapMs: Math.max(1000, v.delay * 1000) });
    pages++; h.pages++;
    if (!res.ok) continue;
    const html = await res.text();
    if (/anubis|captcha|cf-challenge/i.test(html.slice(0, 5000))) { h.skipped = 'botskydd/CAPTCHA – hoppas över'; continue; }
    const hrs = extractHours(html);
    if (hrs) { results[l.sigel] = { url: u.href, ...hrs }; h.found++; }
  } catch { /* ignore single page errors */ }
  if (pages % 25 === 0) console.log(`pages ${pages}, with hours ${Object.keys(results).length}`);
}
for (const h of Object.values(hosts)) delete h.robots;
const skipped = Object.entries(hosts).filter(([, h]) => h.skipped);
const summary = {
  hamtad: new Date().toISOString(), user_agent: UA, sidor: pages, vardar: Object.keys(hosts).length,
  bibliotek_med_strukturerade_tider: Object.keys(results).length,
  overhoppade_vardar: skipped.length,
  skal: skipped.reduce((a, [, h]) => ((a[h.skipped] = (a[h.skipped] || 0) + 1), a), {}),
};
writeJSON(path.join(RAW, 'web-hours.json'), { summary, hosts, results });
console.log(JSON.stringify(summary, null, 1));
