// Kvalitetsgrinden för butiks- och kommunsidor och omdirigeringsfilen (om sajten är byggd).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { harEgenSida, kommunHarSida, grindUnderlag, fullstandig } from "../src/grind.js";

const tider = { mon: "stängt", tue: "10:00-18:00", wed: "10:00-18:00", thu: "10:00-18:00", fri: "10:00-18:00", sat: "10:00-15:00", sun: "stängt" };
const butik = (x = {}) => ({ namn: "Butik", kommun: "Stad", gatuadress: "Storgatan 1", oppettider: tider, telefon: "010-123", webb: "https://butik.se/", sortiment: ["kläder", "möbler", "böcker"], ...x });
const stad = (b, fler = 3) => [b, ...Array.from({ length: fler - 1 }, (_, i) => butik({ namn: `Annan ${i}`, webb: `https://annan${i}.se/` }))];
const prov = (b, alla = stad(b)) => harEgenSida(b, grindUnderlag(alla));

test("adress + riktiga tider + två extra uppgifter ger egen sida", () => {
  assert.equal(prov(butik()), true);
  assert.equal(prov(butik({ sortiment: [] })), true);
});
test("bara en extra uppgift räcker inte", () => {
  assert.equal(prov(butik({ telefon: null, sortiment: [] })), false);
});
test("utan adress eller utan riktiga öppettider blir det ingen egen sida", () => {
  assert.equal(prov(butik({ gatuadress: null })), false);
  assert.equal(prov(butik({ oppettider: Object.fromEntries(Object.keys(tider).map((d) => [d, "stängt"])) })), false);
  assert.equal(prov(butik({ oppettider: null })), false);
});
test("en webbadress som flera butiker delar räknas inte", () => {
  const b = butik({ sortiment: [], webb: "https://kedja.se/" });
  assert.equal(prov(b, [b, butik({ namn: "X", webb: "https://kedja.se/" }), butik({ namn: "Y" })]), false);
});
test("i kommuner med färre än tre butiker får ingen butik egen sida", () => {
  const b = butik();
  assert.equal(prov(b, stad(b, 2)), false);
});
test("kommunsida kräver tre butiker eller minst en fullständig", () => {
  assert.equal(kommunHarSida({ enheter: [butik(), butik(), butik()].map((e) => ({ ...e, oppettider: null })) }), true);
  assert.equal(kommunHarSida({ enheter: [butik()] }), true);
  assert.equal(fullstandig(butik({ gatuadress: null })), false);
  assert.equal(kommunHarSida({ enheter: [butik({ oppettider: null }), butik({ gatuadress: null })] }), false);
});

const dist = (p) => new URL(`../dist${p.endsWith("/") ? p : `${p}/`}index.html`, import.meta.url);
const fil = new URL("../dist/_redirects", import.meta.url);
test("_redirects håller sig inom Cloudflares gränser och pekar på befintliga sidor", { skip: !existsSync(fil) && "sajten är inte byggd" }, () => {
  const rader = readFileSync(fil, "utf8").split("\n").filter((r) => r && !r.startsWith("#"));
  const dyn = rader.filter((r) => /[:*]/.test(r.split(" ")[0]));
  assert.ok(rader.length - dyn.length <= 2000, `${rader.length - dyn.length} statiska`);
  assert.ok(dyn.length <= 100, `${dyn.length} dynamiska`);
  for (const r of rader) {
    assert.ok(r.length <= 1000, r);
    const [fran, till, kod] = r.split(/\s+/);
    assert.equal(kod, "301", r);
    assert.ok(existsSync(dist(till)), `mål saknas: ${r}`);
    assert.ok(!existsSync(dist(fran)), `källan finns som sida: ${r}`);
  }
});
