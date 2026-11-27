// Kvalitetsgrinden för parkeringar.nu och de byggda omdirigeringsfilerna (om sajten är byggd).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { harEgenSida, poang, kommunHarSida, adressNamn } from "../src/grind.js";

const dygn = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, "00:00-24:00"]));
const phus = { namn: "P-hus Kronan", typ: "parkeringshus", gatuadress: "Parkgatan 5", lat: 56.1, lon: 15.5, oppettider: dygn,
  extra: { kapacitet: 92, taxa: "Alla dagar 00-24:; Per påbörjad 30 min - 10 kr; 24 h - 100 kr", taxa_per_timme: 20, hojdbegransning: 1.9, zonkod: "6240" } };

test("namngivet p-hus med pris, taxa, höjd och zonkod får egen sida", () => {
  assert.equal(harEgenSida(phus), true);
  assert.ok(poang(phus).summa >= 5);
});
test("uthyrningsplats får aldrig egen sida", () => {
  assert.equal(harEgenSida({ ...phus, extra: { ...phus.extra, op: { endast_uthyrning: true } } }), false);
  assert.equal(harEgenSida({ ...phus, extra: { ...phus.extra, taxa: "Endast elbilsladdning" } }), false);
});
test("adressnamn utan stor typ får ingen sida", () => {
  const e = { ...phus, namn: "Basilikavägen 12 / Karlsdalsallén 50", typ: "markparkering" };
  assert.equal(adressNamn(e), true);
  assert.equal(harEgenSida(e), false);
});
test("för liten parkering får ingen sida", () => {
  assert.equal(harEgenSida({ ...phus, typ: "markparkering", extra: { ...phus.extra, kapacitet: 6 } }), false);
});
test("p-hus utan pris och data klarar inte grinden, men verifierade uppgifter kan lyfta det", () => {
  const tomt = { namn: "P-hus Nordstan", typ: "parkeringshus", lat: 57.7, lon: 11.9, extra: { kapacitet: 2700 } };
  assert.equal(harEgenSida(tomt), false);
  assert.equal(harEgenSida({ ...tomt, verifierad: { timpris: 30, taxa: ["a", "b"] }, extra: { ...tomt.extra, taxa_per_timme: 30 } }), true);
});
test("kommungrinden", () => {
  const e = (x) => ({ extra: x });
  assert.equal(kommunHarSida({ enheter: [e({}), e({})] }), false);
  assert.equal(kommunHarSida({ enheter: [e({}), e({})] }, true), true);
  assert.equal(kommunHarSida({ enheter: [{ egenSida: true, extra: {} }] }), true);
  const rik = Array.from({ length: 8 }, (_, i) => e(i < 5 ? { taxa_per_timme: 10 } : {}));
  assert.equal(kommunHarSida({ enheter: rik }), true);
});

const dist = new URL("../dist/", import.meta.url);
const byggd = existsSync(new URL("_redirects", dist));
test("_redirects håller sig inom Cloudflares gränser och pekar på befintliga sidor", { skip: !byggd && "sajten är inte byggd" }, () => {
  const rader = readFileSync(new URL("_redirects", dist), "utf8").split("\n").filter((r) => r && !r.startsWith("#"));
  const dyn = rader.filter((r) => /[:*]/.test(r.split(" ")[0]));
  assert.ok(rader.length - dyn.length <= 2000, `${rader.length - dyn.length} statiska`);
  assert.ok(dyn.length <= 100, `${dyn.length} dynamiska`);
  for (const r of rader) {
    const [fran, till, kod] = r.split(" ");
    assert.equal(kod, "301", r);
    assert.ok(existsSync(new URL(`.${till}index.html`, dist)), `mål saknas: ${r}`);
    if (!/[:*]/.test(fran)) assert.ok(!existsSync(new URL(`.${fran}index.html`, dist)), `källan finns som sida: ${r}`);
    else if (existsSync(new URL(`.${fran.split(":")[0]}`, dist))) assert.ok(!readdirSync(new URL(`.${fran.split(":")[0]}`, dist), { withFileTypes: true }).some((x) => x.isDirectory()), `dynamisk regel över befintliga undersidor: ${r}`);
  }
});
test("varje borttagen gammal URL har en 301 i workern, och målet finns", { skip: !byggd && "sajten är inte byggd" }, async () => {
  const gamla = readFileSync(new URL("../data/gamla-url.txt", import.meta.url), "utf8").split(/\r?\n/).filter(Boolean);
  const { default: w } = await import(new URL("_worker.js", dist).href);
  const env = { ASSETS: { fetch: async () => new Response("ok") } };
  let borta = 0;
  for (const u of gamla) {
    if (existsSync(new URL(`.${u}index.html`, dist))) continue;
    borta++;
    const r = await w.fetch(new Request(`https://parkeringar.nu${u}`), env);
    assert.equal(r.status, 301, u);
    const till = new URL(r.headers.get("location")).pathname;
    assert.ok(existsSync(new URL(`.${till}index.html`, dist)), `${u} → ${till}`);
  }
  assert.ok(borta > 0);
  const routes = JSON.parse(readFileSync(new URL("_routes.json", dist), "utf8"));
  assert.ok(routes.include.length + routes.exclude.length <= 100);
});
test("ingen FAQ-schema på sajten (ägarens beslut)", { skip: !byggd && "sajten är inte byggd" }, () => {
  for (const f of ["index.html", "gratis-parkering/index.html", "stockholm/index.html", "guider/p-skiva/index.html"]) {
    assert.ok(!readFileSync(new URL(f, dist), "utf8").includes('"FAQPage"'), f);
  }
});
