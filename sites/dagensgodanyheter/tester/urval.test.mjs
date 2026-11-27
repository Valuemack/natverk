// Hur nyheterna väljs ut och ordnas är intern mekanik och visas aldrig på sajten: inga poäng, vikter, trender
// eller "så räknar vi". Testet läser den synliga delen av sidmallarna och, om sajten är byggd, dist/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const filer = (dir, filter) => (existsSync(dir) ? readdirSync(dir) : []).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? filer(p, filter) : filter(p) ? [p] : [];
});

// Fraser som avslöjar urvalet. Gäller både mallar och byggd sajt.
const AVSLOJANDE = [/läsvärd/i, /så räknar vi/i, /rangordna/i, /google trends/i, /aktualitet/i, /varje natt läser/i,
  /poängsätt/i, /glädjepoäng/i, /tillitspoäng/i, /källans tillit/i, /hur vi väljer ut/i, /viktning/i, /trendar just nu/i];
// I mallarna (inte i artiklarnas text, där orden kan förekomma naturligt) dessutom:
const BARA_MALLAR = [/\btillit\b/i, /\bpoäng\b/i, /\bvikter\b/i];

/** Den synliga delen av en .astro-mall: utan frontmatter och kommentarer. */
const synligAstro = (s) => s.replace(/^---[\s\S]*?\n---/, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/<!--[\s\S]*?-->/g, "");
/** Strängarna i en JS-sidgenerator (llms.txt, rss.xml): bara det som hamnar i utdata. */
const strangarJs = (s) => [...s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)].map((m) => m[2]).join("\n");

test("sidmallarna visar inget om hur nyheterna väljs ut", () => {
  const mallar = filer(join(ROT, "src"), (p) => /\.(astro)$/.test(p) || /src[\\/]pages[\\/].*\.js$/.test(p));
  assert.ok(mallar.length > 10);
  for (const p of mallar) {
    const s = readFileSync(p, "utf8");
    const synlig = p.endsWith(".astro") ? synligAstro(s) : strangarJs(s);
    for (const re of [...AVSLOJANDE, ...BARA_MALLAR]) assert.ok(!re.test(synlig), `${relative(ROT, p)}: ${re} – ${synlig.match(re)?.[0]}`);
  }
});

test("den byggda sajten visar inget om hur nyheterna väljs ut", { skip: !existsSync(join(ROT, "dist")) && "dist saknas" }, () => {
  for (const p of filer(join(ROT, "dist"), (f) => /\.(html|txt|xml)$/.test(f))) {
    const s = readFileSync(p, "utf8").replace(/<script[\s\S]*?<\/script>/gi, "");
    for (const re of AVSLOJANDE) assert.ok(!re.test(s), `${relative(ROT, p)}: ${re}`);
  }
});

test("texterna om källorna: förstahandskällor och etablerade medier, inget förbud mot medier kvar", () => {
  const sidor = ["src/pages/redaktionell-policy.astro", "src/pages/kallor.astro", "src/pages/om.astro", "src/pages/index.astro", "src/pages/llms.txt.js"];
  for (const f of sidor) {
    const s = readFileSync(join(ROT, f), "utf8");
    assert.ok(!/skriver aldrig om andra tidningars|skrivs aldrig om|inga tidningar eller nyhetsbyråer/i.test(s), f);
    assert.match(s, /förstahandskällor[^.]{0,120}etablerade medier/i, f);
  }
});
