// Kvalitetsgrinden för stationssidor och omdirigeringsfilen (om sajten är byggd).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { harEgenSida } from "../src/grind.js";

const tider = { mon: "06:00-22:00", tue: "06:00-22:00", wed: "06:00-22:00", thu: "06:00-22:00", fri: "06:00-22:00", sat: "08:00-22:00", sun: "08:00-22:00" };
const dygn = Object.fromEntries(Object.keys(tider).map((d) => [d, "00:00-24:00"]));
const W = new Map([["https://kedja.se/station/1", 1], ["https://kedja.se/", 40]]);

test("bemannade öppettider ger egen sida", () => {
  assert.equal(harEgenSida({ gatuadress: "Storgatan 1", oppettider: tider, extra: {} }, W), true);
});
test("bara pumpar dygnet runt räcker inte", () => {
  assert.equal(harEgenSida({ gatuadress: "Storgatan 1", oppettider: dygn, extra: {} }, W), false);
});
test("adress + egen telefon + egen stationssida ger egen sida", () => {
  assert.equal(harEgenSida({ gatuadress: "Storgatan 1", telefon: "0431-123", webb: "https://kedja.se/station/1", extra: {} }, W), true);
});
test("kedjans gemensamma webbadress räknas inte", () => {
  assert.equal(harEgenSida({ gatuadress: "Storgatan 1", telefon: "0431-123", webb: "https://kedja.se/", extra: {} }, W), false);
});
test("adress + tre tjänster + telefon ger egen sida, utan adress aldrig", () => {
  const extra = { tjanster: { butik: true, biltvatt: true }, drivmedel: { e85: true } };
  assert.equal(harEgenSida({ gatuadress: "Storgatan 1", telefon: "0431-123", extra }, W), true);
  assert.equal(harEgenSida({ telefon: "0431-123", webb: "https://kedja.se/station/1", extra }, W), false);
});

const fil = new URL("../dist/_redirects", import.meta.url);
test("_redirects håller sig inom Cloudflares gränser och pekar på befintliga sidor", { skip: !existsSync(fil) && "sajten är inte byggd" }, () => {
  const rader = readFileSync(fil, "utf8").split("\n").filter((r) => r && !r.startsWith("#"));
  const dyn = rader.filter((r) => /[:*]/.test(r.split(" ")[0]));
  assert.ok(rader.length - dyn.length <= 2000, `${rader.length - dyn.length} statiska`);
  assert.ok(dyn.length <= 100, `${dyn.length} dynamiska`);
  for (const r of rader) {
    const [fran, till, kod] = r.split(" ");
    assert.equal(kod, "301", r);
    assert.ok(existsSync(new URL(`../dist${till}index.html`, import.meta.url)), `mål saknas: ${r}`);
    if (!/[:*]/.test(fran)) assert.ok(!existsSync(new URL(`../dist${fran}index.html`, import.meta.url)), `källan finns som sida: ${r}`);
  }
});
