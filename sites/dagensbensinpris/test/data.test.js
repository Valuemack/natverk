// Rimlighetskontroll av EU-datan och skatteuppdelningen, så att ett ändrat filformat inte ger fel priser på sajten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const eu = JSON.parse(readFileSync(new URL("../data/eu.json", import.meta.url)));

test("Sveriges veckopris i kronor är rimligt", () => {
  const se = eu.lander.SE.serie.at(-1);
  const [datum, b95, diesel, b95utan, , kurs] = se;
  assert.match(datum, /^\d{4}-\d{2}-\d{2}$/);
  const kr = (x) => x / kurs;
  assert.ok(kr(b95) > 10 && kr(b95) < 30, `95: ${kr(b95)}`);
  assert.ok(kr(diesel) > 10 && kr(diesel) < 35, `diesel: ${kr(diesel)}`);
  assert.ok(b95utan < b95 / 1.25, "pris utan skatt ska vara lägre än pris exkl. moms");
});

test("minst 25 länder med färsk data", () => {
  const senaste = eu.lander.SE.serie.at(-1)[0];
  const farska = Object.values(eu.lander).filter((l) => l.serie.at(-1)?.[0] === senaste);
  assert.ok(farska.length >= 25, `${farska.length} länder`);
});
