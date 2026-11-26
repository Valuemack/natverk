// Gemensamma hjälpare för dataskripten: hämtning med generisk User-Agent och paus mellan anrop.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = join(ROT, "data");
const UA = "Mozilla/5.0 (compatible; namnsdag-datahamtning/1.0)";

export const vanta = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hämtar text eller JSON. Minst 1,1 s mellan anrop (respekterar källornas belastning). */
let senast = 0;
export async function hamta(url, { json = false, metod = "GET", kropp, forsok = 3 } = {}) {
  for (let i = 1; i <= forsok; i++) {
    const vant = 1100 - (Date.now() - senast);
    if (vant > 0) await vanta(vant);
    senast = Date.now();
    try {
      const r = await fetch(url, {
        method: metod,
        headers: { "user-agent": UA, ...(kropp && { "content-type": "application/json" }) },
        body: kropp && JSON.stringify(kropp),
        signal: AbortSignal.timeout(90_000),
      });
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
