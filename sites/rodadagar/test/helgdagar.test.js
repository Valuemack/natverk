// Kontrollerar motorn mot kända, officiella datum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { iso, isoVecka, veckorIAr, datum } from "@natverk/core/datum.js";
import { paskdagen, helgdagarAr, klamdagarAr, flaggdagarAr, rodaDagarAr } from "../src/lib/helgdagar.js";

test("påskdagen kända år", () => {
  assert.equal(iso(paskdagen(2024)), "2024-03-31");
  assert.equal(iso(paskdagen(2025)), "2025-04-20");
  assert.equal(iso(paskdagen(2026)), "2026-04-05");
  assert.equal(iso(paskdagen(2027)), "2027-03-28");
  assert.equal(iso(paskdagen(2028)), "2028-04-16");
});

test("röda dagar 2026", () => {
  const m = Object.fromEntries(helgdagarAr(2026).map((h) => [h.id, iso(h.datum)]));
  assert.equal(m["langfredagen"], "2026-04-03");
  assert.equal(m["kristi-himmelsfardsdag"], "2026-05-14");
  assert.equal(m["pingstdagen"], "2026-05-24");
  assert.equal(m["midsommarafton"], "2026-06-19");
  assert.equal(m["midsommardagen"], "2026-06-20");
  assert.equal(m["alla-helgons-dag"], "2026-10-31");
  assert.equal(rodaDagarAr(2026).length, 13);
});

test("midsommar och alla helgon 2027", () => {
  const m = Object.fromEntries(helgdagarAr(2027).map((h) => [h.id, iso(h.datum)]));
  assert.equal(m["midsommarafton"], "2027-06-25");
  assert.equal(m["alla-helgons-dag"], "2027-11-06");
});

test("klämdag efter Kristi himmelsfärd 2026", () => {
  const k = klamdagarAr(2026).map((x) => iso(x.datum));
  assert.ok(k.includes("2026-05-15"));
});

test("valdag 2026 är 13 september", () => {
  const v = flaggdagarAr(2026).find((f) => f.namn.startsWith("Valdagen"));
  assert.equal(iso(v.datum), "2026-09-13");
  assert.equal(flaggdagarAr(2027).find((f) => f.namn.startsWith("Valdagen")), undefined);
});

test("ISO-veckor", () => {
  assert.equal(isoVecka(datum(2026, 11, 19)).vecka, 47);
  assert.deepEqual(isoVecka(datum(2027, 1, 1)), { ar: 2026, vecka: 53 });
  assert.equal(veckorIAr(2026), 53);
  assert.equal(veckorIAr(2027), 52);
});

// --- Utökade kontroller (årssidor, helgsidor, arbetsdagar) ---
import { plusDagar } from "@natverk/core/datum.js";
import { mandagIVecka } from "@natverk/core/datum.js";
import { arbetsdagarDetalj, semestertips, semestertipsAr, gruppDagar, gruppBySlug, helgArHref } from "../src/lib/ledighet.js";

/** Gauss påskformel (oberoende av Meeus-varianten i motorn). */
function gaussPask(y) {
  const a = y % 19, b = y % 4, c = y % 7, k = Math.floor(y / 100);
  const p = Math.floor((13 + 8 * k) / 25), q = Math.floor(k / 4);
  const M = (15 - p + k - q) % 30, N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30, e = (2 * b + 4 * c + 6 * d + N) % 7;
  let dag = 22 + d + e; // dag i mars
  if (d === 29 && e === 6) dag = 50; // 26 april → 19 april
  else if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) dag = 49; // 25 april → 18 april
  return datum(y, 3, 1 + dag - 1);
}

test("påskdagen: motorn stämmer med Gauss formel 1900–2200", () => {
  for (let y = 1900; y <= 2200; y++) assert.equal(iso(paskdagen(y)), iso(gaussPask(y)), String(y));
});

test("påskdagen 2025–2030 mot kända datum", () => {
  const kanda = { 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28", 2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21" };
  for (const [y, d] of Object.entries(kanda)) assert.equal(iso(paskdagen(Number(y))), d);
});

test("rörliga helgdagar 2025–2030", () => {
  const kanda = {
    2025: { "kristi-himmelsfardsdag": "2025-05-29", pingstdagen: "2025-06-08", midsommarafton: "2025-06-20", "alla-helgons-dag": "2025-11-01" },
    2026: { "kristi-himmelsfardsdag": "2026-05-14", pingstdagen: "2026-05-24", midsommarafton: "2026-06-19", "alla-helgons-dag": "2026-10-31" },
    2027: { "kristi-himmelsfardsdag": "2027-05-06", pingstdagen: "2027-05-16", midsommarafton: "2027-06-25", "alla-helgons-dag": "2027-11-06" },
    2028: { "kristi-himmelsfardsdag": "2028-05-25", pingstdagen: "2028-06-04", midsommarafton: "2028-06-23", "alla-helgons-dag": "2028-11-04" },
    2029: { "kristi-himmelsfardsdag": "2029-05-10", pingstdagen: "2029-05-20", midsommarafton: "2029-06-22", "alla-helgons-dag": "2029-11-03" },
    2030: { "kristi-himmelsfardsdag": "2030-05-30", pingstdagen: "2030-06-09", midsommarafton: "2030-06-21", "alla-helgons-dag": "2030-11-02" },
  };
  for (const [y, f] of Object.entries(kanda)) {
    const m = Object.fromEntries(helgdagarAr(Number(y)).map((h) => [h.id, iso(h.datum)]));
    for (const [id, d] of Object.entries(f)) assert.equal(m[id], d, `${id} ${y}`);
  }
});

test("midsommar och alla helgon faller på rätt veckodag inom rätt datumspann 1990–2100", () => {
  for (let y = 1990; y <= 2100; y++) {
    const m = Object.fromEntries(helgdagarAr(y).map((h) => [h.id, h.datum]));
    const ma = m["midsommarafton"], md = m["midsommardagen"], ah = m["alla-helgons-dag"];
    assert.equal(ma.getUTCDay(), 5); assert.ok(ma.getUTCMonth() === 5 && ma.getUTCDate() >= 19 && ma.getUTCDate() <= 25);
    assert.equal(md.getUTCDay(), 6); assert.ok(md.getUTCMonth() === 5 && md.getUTCDate() >= 20 && md.getUTCDate() <= 26);
    assert.equal(iso(plusDagar(ma, 1)), iso(md));
    assert.equal(ah.getUTCDay(), 6);
    assert.ok(ah >= datum(y, 10, 31) && ah <= datum(y, 11, 6), String(y));
    assert.equal(m["kristi-himmelsfardsdag"].getUTCDay(), 4);
    assert.equal(m["langfredagen"].getUTCDay(), 5);
    assert.equal(m["pingstdagen"].getUTCDay(), 0);
  }
});

test("arbetsdagar räknade för hand 2025–2027", () => {
  // 2025: 261 vardagar − 9 röda på vardag − 3 aftnar = 249
  // 2026: 261 − 7 − 3 = 251 · 2027: 261 − 5 − 3 = 253
  const fasit = { 2025: [261, 9, 3, 249], 2026: [261, 7, 3, 251], 2027: [261, 5, 3, 253] };
  for (const [y, [v, r, a, n]] of Object.entries(fasit)) {
    const t = arbetsdagarDetalj(Number(y)).totalt;
    assert.deepEqual([t.vardagar, t.roda, t.aftnar, t.arbetsdagar], [v, r, a, n], y);
    assert.equal(t.inklAftnar, v - r);
  }
  const m27 = arbetsdagarDetalj(2027).manader;
  assert.equal(m27[0].arbetsdagar, 19); // jan: 21 vardagar − nyårsdagen − trettondedag jul
  assert.equal(m27[2].arbetsdagar, 21); // mars: 23 vardagar − långfredagen − annandag påsk
  assert.equal(m27[11].arbetsdagar, 21); // dec: 23 vardagar − julafton − nyårsafton
  // summan av månaderna = totalen, och lika med den äldre funktionen
  for (const y of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
    const d = arbetsdagarDetalj(y);
    assert.equal(d.manader.reduce((s, m) => s + m.arbetsdagar, 0), d.totalt.arbetsdagar);
    assert.equal(d.kvartal.reduce((s, q) => s + q.arbetsdagar, 0), d.totalt.arbetsdagar);
    assert.equal(d.totalt.kalenderdagar, y % 4 === 0 ? 366 : 365);
  }
});

test("semestertips 2027", () => {
  const pask = semestertips(gruppDagar(gruppBySlug("pask"), 2027));
  assert.deepEqual(pask.map((t) => [t.semesterdagar, t.dagar]), [[4, 10]]);
  const kristi = semestertips(gruppDagar(gruppBySlug("kristi-himmelsfardsdag"), 2027));
  assert.deepEqual(kristi.map((t) => [t.semesterdagar, t.dagar, iso(t.fran), iso(t.till)]),
    [[1, 4, "2027-05-06", "2027-05-09"], [4, 9, "2027-05-01", "2027-05-09"]]);
  // Nationaldagen 2027 är en söndag: inga tips
  assert.equal(semestertips(gruppDagar(gruppBySlug("nationaldagen"), 2027)).length, 0);
  // Trettondedag jul (onsdag): ta 4 dagar 4–8 jan (utom 6:e), ledig 31 dec 2026–10 jan 2027
  const tr = semestertipsAr(2027).find((t) => t.grupper.includes("Trettondedag jul") && t.semesterdagar === 4 && !t.grupper.some((g) => g.startsWith("Nyår")));
  assert.equal(iso(tr.fran), "2026-12-31"); assert.equal(iso(tr.till), "2027-01-10"); assert.equal(tr.dagar, 11);
  // Varje tips: ledigheten innehåller exakt k arbetsdagar
  for (const t of semestertipsAr(2027)) assert.equal(t.ta.length, t.semesterdagar);
});

test("helgsidor länkas rätt", () => {
  const ar = [2025, 2026, 2027];
  assert.equal(helgArHref("langfredagen", 2027, ar), "/pask/2027/");
  assert.equal(helgArHref("midsommardagen", 2027, ar), "/midsommar/2027/");
  assert.equal(helgArHref("annandag-jul", 2026, ar), "/julafton/2026/");
  assert.equal(helgArHref("nyarsdagen", 2027, ar), "/nyarsafton/2026/");
  assert.equal(helgArHref("pask", 2031, ar), null);
});

test("ISO-veckor 2025–2030: antal och vecka 1", () => {
  const fasit = { 2025: [52, "2024-12-30"], 2026: [53, "2025-12-29"], 2027: [52, "2027-01-04"], 2028: [52, "2028-01-03"], 2029: [52, "2029-01-01"], 2030: [52, "2029-12-31"] };
  for (const [y, [n, v1]] of Object.entries(fasit)) {
    assert.equal(veckorIAr(Number(y)), n, y);
    assert.equal(iso(mandagIVecka(Number(y), 1)), v1, y);
    // 4 januari ligger alltid i vecka 1
    assert.deepEqual(isoVecka(datum(Number(y), 1, 4)), { ar: Number(y), vecka: 1 });
  }
  assert.deepEqual(isoVecka(datum(2027, 12, 31)), { ar: 2027, vecka: 52 });
  assert.deepEqual(isoVecka(datum(2029, 12, 31)), { ar: 2030, vecka: 1 });
});
