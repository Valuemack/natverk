// Artig hämtning: respekterar robots.txt, högst ett anrop per sekund totalt och en generisk User-Agent
// utan personuppgifter. Används av både hamta.mjs (flöden) och skriv.mjs (källtexter, bilder).

export const UA = "Mozilla/5.0 (compatible; goda-nyheter-hamtare/1.0; +https://dagensgodanyheter.se/redaktionell-policy/)";
const UA_TOKEN = "goda-nyheter-hamtare";
const MIN_MS = 1000; // högst 1 anrop per sekund, robots.txt-anrop inräknade

let senast = 0;
async function vanta() {
  const kvar = senast + MIN_MS - Date.now();
  if (kvar > 0) await new Promise((r) => setTimeout(r, kvar));
  senast = Date.now();
}

/** Tolkar robots.txt och returnerar reglerna som gäller för oss (vår token, annars *). */
export function tolkaRobots(text) {
  const grupper = [];
  let aktuell = null;
  let senasteVarAgent = false;
  for (const radRa of String(text).split(/\r?\n/)) {
    const rad = radRa.replace(/#.*/, "").trim();
    if (!rad) continue;
    const m = rad.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const falt = m[1].toLowerCase();
    const varde = m[2].trim();
    if (falt === "user-agent") {
      if (!senasteVarAgent) { aktuell = { agenter: [], regler: [] }; grupper.push(aktuell); }
      aktuell.agenter.push(varde.toLowerCase());
      senasteVarAgent = true;
    } else {
      senasteVarAgent = false;
      if (!aktuell) continue;
      if (falt === "allow" || falt === "disallow") aktuell.regler.push({ tillat: falt === "allow", monster: varde });
    }
  }
  const egen = grupper.filter((g) => g.agenter.some((a) => a !== "*" && UA_TOKEN.includes(a)));
  const valda = egen.length ? egen : grupper.filter((g) => g.agenter.includes("*"));
  return valda.flatMap((g) => g.regler);
}

function matchar(monster, sokvag) {
  if (!monster) return false;
  const re = "^" + monster.split("*").map((d) => d.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$");
  return new RegExp(re).test(sokvag);
}

/** Längsta matchande regel vinner; vid lika vinner Allow (Googles tolkning). Tom Disallow = tillåtet. */
export function tillatet(regler, sokvag) {
  let bast = null;
  for (const r of regler) {
    if (!r.monster) continue;
    if (matchar(r.monster, sokvag)) {
      if (!bast || r.monster.length > bast.monster.length || (r.monster.length === bast.monster.length && r.tillat)) bast = r;
    }
  }
  return !bast || bast.tillat;
}

const robotsCache = new Map();
async function robotsFor(url) {
  const u = new URL(url);
  if (robotsCache.has(u.origin)) return robotsCache.get(u.origin);
  // Enligt RFC 9309: 2xx = tolka filen, 4xx = ingen robots.txt (allt tillåtet),
  // 5xx eller ingen kontakt = behandla som att allt är spärrat. Ett nytt försök görs innan dess.
  const ALLT_SPARRAT = [{ tillat: false, monster: "/" }];
  let regler = ALLT_SPARRAT;
  for (let forsok = 1; forsok <= 2; forsok++) {
    try {
      await vanta();
      const svar = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000), redirect: "follow" });
      if (svar.ok) { const typ = svar.headers.get("content-type") || ""; regler = /html/i.test(typ) ? [] : tolkaRobots(await svar.text()); break; }
      if (svar.status >= 400 && svar.status < 500 && svar.status !== 429) { regler = []; break; }
    } catch { /* nätverksfel: nytt försök, sedan spärrat */ }
    if (forsok < 2) await sov(3000);
  }
  robotsCache.set(u.origin, regler);
  return regler;
}

export class NekadAvRobots extends Error {}

/** Hämtar en URL artigt. Kastar NekadAvRobots om robots.txt inte tillåter sökvägen. */
export async function hamta(url, { accept = "*/*", timeout = 30000, binar = false } = {}) {
  const regler = await robotsFor(url);
  const u = new URL(url);
  if (!tillatet(regler, u.pathname + u.search)) throw new NekadAvRobots(`robots.txt tillåter inte ${u.pathname}`);
  let svar;
  for (let forsok = 1; ; forsok++) {
    await vanta();
    try {
      svar = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "sv,en;q=0.8" }, signal: AbortSignal.timeout(timeout), redirect: "follow" });
      if ((svar.status === 429 || svar.status >= 500) && forsok < 2) { await sov(5000); continue; }
      break;
    } catch (e) {
      if (forsok >= 2) throw e; // nätverksfel: ett nytt försök efter en paus
      await sov(3000);
    }
  }
  if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
  // Även slutadressen efter omdirigering ska vara tillåten.
  if (svar.url && svar.url !== url) {
    const slut = new URL(svar.url);
    const r2 = await robotsFor(svar.url);
    if (!tillatet(r2, slut.pathname + slut.search)) throw new NekadAvRobots(`robots.txt tillåter inte ${slut.pathname}`);
  }
  return { url: svar.url || url, typ: svar.headers.get("content-type") || "", data: binar ? Buffer.from(await svar.arrayBuffer()) : await svar.text() };
}

// ---------- text ----------

const ENTITETER = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", aring: "å", Aring: "Å", auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö", eacute: "é", uuml: "ü", shy: "" };
export function avkoda(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITETER[n] ?? m);
}

/** HTML → ren text med styckebrytningar. */
export function textAvHtml(html) {
  return avkoda(String(html ?? "")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote|figcaption)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Plockar ut huvudtexten ur en artikelsida: <article>/<main> om de finns, annars hela body. */
export function huvudtext(html) {
  const s = String(html);
  const kandidater = [/<article[\s\S]*?<\/article>/i, /<main[\s\S]*?<\/main>/i, /<body[\s\S]*<\/body>/i];
  for (const re of kandidater) {
    const m = s.match(re);
    if (m) {
      const t = textAvHtml(m[0]);
      if (t.length > 400) return t;
    }
  }
  return textAvHtml(s);
}

export const sov = (ms) => new Promise((r) => setTimeout(r, ms));
