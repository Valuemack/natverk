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
