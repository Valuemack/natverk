// AI-bilderna: prompten ska alltid förbjuda personer, text och iscensatta händelser, och utan nyckel görs inga anrop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { byggPrompt, rensaMotiv, aiBild, STANDARDMOTIV, BILDSTORLEK } from "../scripts/lib/ai-bild.mjs";
import { KAT_SLUGS } from "../src/lib/kategorier.js";

test("prompten förbjuder personer, text och verkliga händelser", () => {
  const p = byggPrompt("young aspen trees in a Swedish forest", "miljo");
  assert.match(p, /aspen trees/);
  assert.match(p, /No identifiable people/);
  assert.match(p, /No text/);
  assert.match(p, /do not recreate a specific real event/i);
});

test("motiv med personer eller händelser byts mot avdelningens standardmotiv", () => {
  for (const m of ["portrait of the minister", "researchers shaking hands at a press conference", "a crowd celebrating", "", null]) {
    assert.equal(rensaMotiv(m, "vetenskap"), STANDARDMOTIV.vetenskap, String(m));
  }
  assert.equal(rensaMotiv("a coral reef with fish", "djur-natur"), "a coral reef with fish");
});

test("varje avdelning har ett standardmotiv utan personer", () => {
  for (const k of KAT_SLUGS) {
    assert.ok(STANDARDMOTIV[k], k);
    assert.equal(rensaMotiv(STANDARDMOTIV[k], k), STANDARDMOTIV[k], k);
  }
});

test("bildstorleken är 16:9, minst 1200 px bred och delbar med 16", () => {
  const [b, h] = BILDSTORLEK.split("x").map(Number);
  assert.ok(b >= 1200 && b % 16 === 0 && h % 16 === 0);
  assert.ok(Math.abs(b / h - 16 / 9) < 0.01);
});

test("utan OPENAI_API_KEY görs inget anrop", async () => {
  const forra = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let anrop = 0;
  const dir = mkdtempSync(join(tmpdir(), "goda-"));
  const r = await aiBild({ slug: "test-bild-utan-nyckel", motiv: "a lake", kategori: "miljo", publicDir: dir, hamtare: async () => { anrop++; } });
  if (forra) process.env.OPENAI_API_KEY = forra;
  assert.equal(r, null);
  assert.equal(anrop, 0);
  assert.ok(!existsSync(join(dir, "bilder")));
});

test("med nyckel skickas rätt fält och bilden sparas i tre storlekar", async () => {
  const forra = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-nyckel-inte-riktig";
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 1536, height: 864, channels: 3, background: "#3a6" } }).webp().toBuffer();
  let skickat;
  const hamtare = async (url, opt) => { skickat = { url, body: JSON.parse(opt.body), auth: opt.headers.Authorization }; return { ok: true, json: async () => ({ data: [{ b64_json: png.toString("base64") }] }) }; };
  const dir = mkdtempSync(join(tmpdir(), "goda-"));
  const r = await aiBild({ slug: "test-bild", motiv: "a lake", kategori: "miljo", alt: "En sjö", publicDir: dir, hamtare });
  if (forra) process.env.OPENAI_API_KEY = forra; else delete process.env.OPENAI_API_KEY;
  assert.equal(skickat.url, "https://api.openai.com/v1/images/generations");
  assert.equal(skickat.body.size, BILDSTORLEK);
  assert.equal(skickat.body.output_format, "webp");
  assert.match(skickat.body.prompt, /No identifiable people/);
  assert.equal(r.illustration, true);
  assert.equal(r.licens, "Illustration: Dagens goda nyheter");
  assert.doesNotMatch(JSON.stringify([r.alt, r.licens, r.fil]), /\bAI\b/);
  for (const f of ["test-bild.webp", "test-bild.jpg", "test-bild-640.webp"]) assert.ok(existsSync(join(dir, "bilder", f)), f);
  const meta = await sharp(join(dir, "bilder", "test-bild.webp")).metadata();
  assert.ok(meta.width >= 1200);
});
