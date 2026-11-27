// Gemensamma hjälpare för dataskripten: hämtning med generisk User-Agent och paus mellan anrop.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = join(ROT, "data");
const UA = "Mozilla/5.0 (compatible; namnsdag-datahamtning/1.0)";
// Wikimedia kräver en beskrivande User-Agent utan webbläsarsträng (meta.wikimedia.org/wiki/User-Agent_policy).
const UA_WIKI = "namnsdag-datahamtning/1.0 (https://namnsdagaridag.se/om/)";

export const vanta = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hämtar text eller JSON. Minst 1,1 s mellan anrop (respekterar källornas belastning). */
let senast = 0;
export async function hamta(url, { json = false, metod = "GET", kropp, forsok = 6, paus = 1100 } = {}) {
  for (let i = 1; i <= forsok; i++) {
    const vant = paus - (Date.now() - senast);
    if (vant > 0) await vanta(vant);
    senast = Date.now();
    try {
      const r = await fetch(url, {
        method: metod,
        headers: { "user-agent": /wiki(pedia|data)\.org/.test(url) ? UA_WIKI : UA, accept: "application/json, text/plain, */*", ...(kropp && { "content-type": "application/json" }) },
        body: kropp && JSON.stringify(kropp),
        signal: AbortSignal.timeout(90_000),
      });
      if (r.status === 429 || r.status === 503) { const ra = Number(r.headers.get("retry-after")) || 20 * i; console.log(`(${r.status}, väntar ${ra} s)`); await vanta(ra * 1000); throw new Error(`${r.status} ${url}`); }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      // SCB:s API svarar med BOM; ta bort den.
      const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
      return json ? JSON.parse(text) : text;
    } catch (e) {
      if (i === forsok) throw e;
      await vanta(3000 * i);
    }
  }
}

export function skrivJson(fil, data) {
  const p = join(DATA, fil);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 1) + "\n");
}
export function lasJson(fil, standard = null) {
  const p = join(DATA, fil);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : standard;
}

/** HTML → ren text. */
export function text(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&([a-z]+);/gi, (m, e) => ({ aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", uuml: "ü", quot: '"', lt: "<", gt: ">" })[e] ?? m)
    .replace(/\s+/g, " ");
}

export const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** Namnen som får egna namnsidor: almanackans namn (med varianter) och alla tilltalsnamn med minst 1 000 bärare 2020. */
export function namnurval(minBarare = 1000) {
  const alm = lasJson("namnlangd.json").namn;
  const alla = lasJson("scb-alla.json").namn;
  const set = new Set(alm.flatMap((n) => [n.namn, ...(n.varianter ?? [])]));
  for (const [n, a] of Object.entries(alla)) if (a[0] + a[1] >= minBarare && !n.includes(" ")) set.add(n);
  return [...set].sort((a, b) => a.localeCompare(b, "sv"));
}
