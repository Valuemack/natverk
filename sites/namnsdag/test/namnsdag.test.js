// Kontroller av namnsdagssajtens data och språkhjälp, och (om bygget finns) av de färdiga sidorna:
// genitiv, könsandelar, antal namn, variantregeln, FN-dagar, titlar, beskrivningar och schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = fileURLToPath(new URL("..", import.meta.url));
process.chdir(ROT); // sajtens moduler läser data/ relativt arbetskatalogen
register("./json-hook.mjs", import.meta.url);
const S = await import("../src/site.js");

test("genitiv: inget extra s efter s, x och z", () => {
  assert.equal(S.genitiv("Linus"), "Linus");
  assert.equal(S.genitiv("Max"), "Max");
  assert.equal(S.genitiv("Inez"), "Inez");
  assert.equal(S.genitiv("Anna"), "Annas");
});

test("kön anges som andelar", () => {
  assert.equal(S.konAndel(92, 8), "92 procent kvinnor och 8 procent män");
  assert.equal(S.konAndel(1, 999), "100 procent män och under 1 procent kvinnor");
  assert.equal(S.konAndel(0, 50), "100 procent män");
  assert.equal(S.konAndel(0, 0), null);
});

test("antal namn i almanackan: 627 nu, 633 från 2027", () => {
  assert.equal(S.ANTAL_NU, 627);
  assert.equal(S.ANTAL_SEN, 633);
  assert.equal(S.NYA_AR, 2027);
});

test("variantregeln: samma stavningsnyckel och samma kön", () => {
  const huvud = (n) => S.UTAN_NAMNSDAG.find((x) => x.namn === n)?.huvud?.namn ?? null;
  assert.equal(huvud("Thomas"), "Tomas");
  assert.notEqual(huvud("Janne"), "Jane");
  assert.notEqual(huvud("Riitta"), "Rita");
  assert.ok(S.UTAN_NAMNSDAG.length > 500, "minst 500 vanliga namn utan namnsdag");
  for (const x of S.UTAN_NAMNSDAG) assert.ok(x.antal >= S.MIN_BARARE, x.namn);
});

test("beskriv håller 140–160 tecken när delarna räcker", () => {
  const t = S.beskriv("Linus har namnsdag den 26 november. Här finns betydelse, statistik och kända personer.", "✓ SCB", "✓ Wikipedia", "✓ Nyfödda 1998–2022", "✓ Kalender", "✓ Grattiskort att dela", "✓ Gratis");
  assert.ok(t.length >= 140 && t.length <= 160, `${t.length}: ${t}`);
  assert.ok(S.beskriv("x".repeat(150), "✓ Något som är för långt att få plats").length === 150);
});

test("helgnamn: gemener mitt i meningen men egennamn behålls", () => {
  assert.equal(S.helgnamn("Juldagen"), "juldagen");
  assert.equal(S.helgnamn("Marie bebådelsedag (Vårfrudagen)"), "Marie bebådelsedag (vårfrudagen)");
  assert.equal(S.helgnamn("Johannes Döparens dag"), "Johannes Döparens dag");
});

test("FN-dagar: rimligt antal, giltiga datum och länk till un.org", () => {
  const fn = JSON.parse(readFileSync(join(ROT, "data/fn-dagar.json"), "utf8"));
  const dagar = Object.entries(fn.dagar);
  assert.ok(dagar.length > 150, `${dagar.length} datum`);
  for (const [k, xs] of dagar) {
    assert.match(k, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    for (const x of xs) assert.ok(x.sv && x.en, `${k}: ${JSON.stringify(x)}`);
  }
  assert.ok(fn.dagar["03-08"]?.length, "Internationella kvinnodagen 8 mars");
  assert.match(fn.url, /^https:\/\/www\.un\.org\//);
});

// ---------- Färdigbyggda sidor (hoppas över om dist saknas) ----------
const DIST = join(ROT, "dist");
const sidor = [];
const gå = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) gå(p); else if (f === "index.html") sidor.push(p); } };
if (existsSync(DIST)) gå(DIST);
const html = (p) => readFileSync(p, "utf8");
const meta = (h, re) => (h.match(re)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const avkoda = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

test("bygget: titlar ≤ 60 tecken och unika, beskrivningar 140–160 och unika", { skip: !sidor.length && "ingen dist" }, () => {
  const titlar = new Map(), besk = new Map(), fel = [];
  for (const p of sidor) {
    const h = html(p);
    if (/widget[\\/]idag/.test(p)) continue; // iframe-widget utan egen layout
    const t = avkoda(meta(h, /<title>([^<]*)<\/title>/));
    const b = avkoda(meta(h, /<meta name="description" content="([^"]*)"/));
    const rel = p.slice(DIST.length).replace(/\\/g, "/");
    if ([...t].length > 60) fel.push(`titel ${[...t].length}: ${rel} – ${t}`);
    if (b.length < 140 || b.length > 160) fel.push(`beskrivning ${b.length}: ${rel}`);
    if (titlar.has(t)) fel.push(`dubbel titel: ${rel} = ${titlar.get(t)}`);
    if (besk.has(b)) fel.push(`dubbel beskrivning: ${rel} = ${besk.get(b)}`);
    titlar.set(t, rel); besk.set(b, rel);
  }
  assert.deepEqual(fel.slice(0, 15), [], `${fel.length} fel`);
});

test("bygget: SEO-grunder på varje indexerad sida", { skip: !sidor.length && "ingen dist" }, () => {
  const fel = [];
  for (const p of sidor) {
    const h = html(p);
    if (/widget[\\/]idag/.test(p)) continue; // iframe-widget utan egen layout
    const rel = p.slice(DIST.length).replace(/\\/g, "/");
    const kropp = h.replace(/<script[\s\S]*?<\/script>/g, "");
    const h1 = (kropp.match(/<h1[\s>]/g) ?? []).length;
    if (h1 !== 1) fel.push(`${h1} h1: ${rel}`);
    const nivaer = [...kropp.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < nivaer.length; i++) if (nivaer[i] > nivaer[i - 1] + 1) { fel.push(`hoppar h${nivaer[i - 1]}→h${nivaer[i]}: ${rel}`); break; }
    if (!/<link rel="canonical" href="https:\/\/namnsdagaridag.se\//.test(h)) fel.push(`canonical: ${rel}`);
    const bild = h.match(/<meta property="og:image" content="https:\/\/namnsdagaridag.se(\/[^"]+)"/)?.[1];
    if (!bild || !existsSync(join(DIST, bild))) fel.push(`og:image saknas: ${rel} (${bild})`);
    if (!/name="twitter:card" content="summary_large_image"/.test(h)) fel.push(`twitter:card: ${rel}`);
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const typer = ld.map((x) => x["@type"]);
    if (!typer.includes("Organization")) fel.push(`Organization: ${rel}`);
    const sida = ld.find((x) => /Page$/.test(x["@type"]));
    if (!sida?.dateModified) fel.push(`WebPage/dateModified: ${rel}`);
    if (rel !== "/index.html" && !typer.includes("BreadcrumbList")) fel.push(`BreadcrumbList: ${rel}`);
    if (rel === "/index.html" && !ld.some((x) => x.potentialAction?.["@type"] === "SearchAction")) fel.push("SearchAction saknas på startsidan");
    for (const m of h.matchAll(/<a [^>]*href="https:\/\/postabrev\.se\/skapa-brev[^"]*"[^>]*>/g)) {
      if (!/rel="sponsored noopener"/.test(m[0]) || !/utm_source=namnsdagaridag&amp;utm_medium=referral&amp;utm_campaign=namnsdag/.test(m[0])) { fel.push(`postabrev-länk: ${rel}`); break; }
    }
  }
  assert.deepEqual(fel.slice(0, 20), [], `${fel.length} fel`);
});

test("bygget: knapp till postabrev.se på namn-, datum- och startsidan", { skip: !sidor.length && "ingen dist" }, () => {
  for (const f of ["index.html", "namn/linus/index.html", "26-november/index.html", "namn/liam/index.html"]) {
    assert.match(html(join(DIST, f)), /href="https:\/\/postabrev\.se\/skapa-brev\?utm_source=namnsdagaridag/, f);
  }
  assert.match(html(join(DIST, "om/index.html")), /samma ägare som/);
});

test("bygget: inga språkfel och inget Event-schema", { skip: !sidor.length && "ingen dist" }, () => {
  const MAN = "Januari|Februari|Mars|April|Maj|Juni|Juli|Augusti|September|Oktober|November|December";
  const fel = [];
  for (const p of sidor) {
    const h = html(p).replace(/<script[\s\S]*?<\/script>/g, (s) => (s.includes("application/ld+json") ? s : ""));
    const rel = p.slice(DIST.length);
    const g = h.match(/[A-ZÅÄÖ][a-zåäöé]*[sxz]s (namnsdag|namn)\b/);
    if (g) fel.push(`genitiv ${g[0]}: ${rel}`);
    if (/idag!\./.test(h)) fel.push(`idag!.: ${rel}`);
    if (new RegExp(`\\d (${MAN})\\b`).test(h)) fel.push(`stor månad: ${rel} ${h.match(new RegExp(`\\d (${MAN})\\b`))[0]}`);
    if (/"@type":\s*"Event"/.test(h)) fel.push(`Event-schema: ${rel}`);
    if (/[\\/]namn[\\/]/.test(rel) && /(är|bärs av) alla (män|kvinnor)/.test(h)) fel.push(`alla män/kvinnor: ${rel}`);
    if (/marie bebådelsedag|johannes döparens|kristi himmelsfärd|nelson Mandela|fN-|fN:s/.test(h)) fel.push(`gemen i egennamn: ${rel}`);
  }
  assert.deepEqual(fel.slice(0, 15), [], `${fel.length} fel`);
});

test("bygget: ingen noindex och inga tunna sidor kvar bakom 301", { skip: !sidor.length && "ingen dist" }, () => {
  const fel = [];
  for (const p of sidor) if (/name="robots" content="[^"]*noindex/.test(html(p))) fel.push(`noindex: ${p.slice(DIST.length)}`);
  const regler = readFileSync(join(ROT, "public/_redirects"), "utf8").split(/\r?\n/).filter((r) => r && !r.startsWith("#")).map((r) => r.split(/\s+/));
  const kallor = [];
  for (const [fran, till, kod] of regler) {
    assert.equal(kod, "301", fran);
    const bas = fran.replace(/\*$/, "").replace(/\/$/, "");
    kallor.push(bas + "/");
    if (existsSync(join(DIST, bas, "index.html"))) fel.push(`sidan finns kvar trots 301: ${fran}`);
    if (!existsSync(join(DIST, till.split("#")[0], "index.html"))) fel.push(`301-mål saknas: ${till}`);
  }
  for (const p of sidor) {
    const h = html(p);
    for (const k of kallor) if (h.includes(`href="${k}"`)) { fel.push(`intern länk till omdirigerad ${k}: ${p.slice(DIST.length)}`); break; }
  }
  assert.deepEqual(fel.slice(0, 15), [], `${fel.length} fel`);
});
