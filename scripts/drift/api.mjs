// Små klienter för Cloudflares och Loopias API. Nycklarna läses från natverk/.env och skrivs aldrig ut.
// Körs med: node --env-file=.env scripts/drift/<skript>.mjs
const CF = "https://api.cloudflare.com/client/v4";
export const KONTO = process.env.CLOUDFLARE_ACCOUNT_ID;

export async function cf(metod, sokvag, kropp) {
  const r = await fetch(CF + sokvag, {
    method: metod,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: kropp ? JSON.stringify(kropp) : undefined,
  });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
  return j;
}

export async function cfAlla(sokvag) {
  const ut = [];
  for (let sida = 1; ; sida++) {
    const j = await cf("GET", `${sokvag}${sokvag.includes("?") ? "&" : "?"}per_page=50&page=${sida}`);
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    ut.push(...j.result);
    if (sida >= (j.result_info?.total_pages ?? 1)) return ut;
  }
}

// Loopia XML-RPC (https://api.loopia.se/RPCSERV). Användarnamn och lösenord skickas först i varje anrop.
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlVarde = (v) => Array.isArray(v)
  ? `<value><array><data>${v.map(xmlVarde).join("")}</data></array></value>`
  : `<value><string>${xmlEsc(v)}</string></value>`;

function tolka(xml) {
  // Minimal tolk för Loopias svar: struct, array, string, int, boolean.
  let i = 0;
  const hoppa = () => { while (i < xml.length && /\s/.test(xml[i])) i++; };
  const tagg = () => { hoppa(); const m = /^<(\/?)([a-zA-Z0-9_.]+)\s*(\/?)>/.exec(xml.slice(i)); if (!m) return null; return { stang: !!m[1], namn: m[2], tom: !!m[3], len: m[0].length }; };
  const las = (namn) => { const t = tagg(); if (!t || t.namn !== namn) throw new Error(`väntade <${namn}> vid ${i}`); i += t.len; return t; };
  const text = (slut) => { const j = xml.indexOf(`</${slut}>`, i); const s = xml.slice(i, j); i = j + slut.length + 3; return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); };
  const varde = () => {
    las("value");
    const t = tagg();
    let v;
    if (!t || t.stang) { v = text("value"); return v; }
    i += t.len;
    if (t.tom) v = "";
    else if (t.namn === "string") v = text("string");
    else if (t.namn === "int" || t.namn === "i4" || t.namn === "double") v = Number(text(t.namn));
    else if (t.namn === "boolean") v = text("boolean") === "1";
    else if (t.namn === "array") {
      las("data"); v = [];
      for (;;) { const n = tagg(); if (n.stang) { i += n.len; break; } v.push(varde()); }
      las("array");
    } else if (t.namn === "struct") {
      v = {};
      for (;;) {
        const n = tagg(); if (n.stang) { i += n.len; break; }
        i += n.len; las("name"); const namn = text("name"); v[namn] = varde(); las("member");
      }
    } else v = text(t.namn);
    las("value");
    return v;
  };
  const start = xml.indexOf("<value>", xml.indexOf("<param>"));
  if (start < 0) {
    const fel = xml.indexOf("<fault>"); if (fel >= 0) { i = xml.indexOf("<value>", fel); return { fault: varde() }; }
    throw new Error("okänt svar från Loopia");
  }
  i = start;
  return varde();
}

export async function loopia(metod, ...params) {
  const alla = [process.env.LOOPIA_API_USER, process.env.LOOPIA_API_PASSWORD, ...params];
  const kropp = `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${metod}</methodName><params>${alla.map((p) => `<param>${xmlVarde(p)}</param>`).join("")}</params></methodCall>`;
  const r = await fetch("https://api.loopia.se/RPCSERV", { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8" }, body: kropp });
  return tolka(await r.text());
}

export const vanta = (ms) => new Promise((r) => setTimeout(r, ms));
