import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristik, farskhetAv, total } from "../scripts/lib/poang.mjs";

const NU = Date.parse("2026-11-25T03:00:00Z");
const kalla = { typ: "larosate", tillit: 0.9 };

test("färskhet halveras på 36 timmar", () => {
  assert.equal(farskhetAv("2026-11-25T03:00:00Z", NU), 1);
  assert.ok(Math.abs(farskhetAv("2026-11-23T15:00:00Z", NU) - 0.5) < 1e-9);
  assert.equal(farskhetAv(null, NU), 0.25);
});

test("positiv nyhet får högre poäng än negativ", () => {
  const bra = heuristik({ titel: "Ny behandling ger hopp", sammanfattning: "Genombrott i forskningen", datum: "2026-11-24T08:00:00Z" }, kalla, NU);
  const dalig = heuristik({ titel: "Olycka och dödsfall", sammanfattning: "Krig och kris", datum: "2026-11-24T08:00:00Z" }, kalla, NU);
  assert.ok(bra.positiv > dalig.positiv);
  assert.ok(total(bra) > total(dalig));
});

test("ord matchas från ordgräns, inte mitt i ord", () => {
  const a = heuristik({ titel: "Kingdom of birds", sammanfattning: "", datum: null }, kalla, NU);
  const b = heuristik({ titel: "Birds", sammanfattning: "", datum: null }, kalla, NU);
  assert.equal(a.positiv, b.positiv);
});

test("totalpoäng 0–100", () => {
  assert.equal(total({ positiv: 1, betydelse: 1, farskhet: 1, tillit: 1 }), 100);
  assert.equal(total({ positiv: 0, betydelse: 0, farskhet: 0, tillit: 0 }), 0);
});

// ---------- glädje först och salig blandning (src/lib/vikter.js) ----------
import { viktadPoang, blanda, VIKTER, TYPER } from "../src/lib/vikter.js";

test("glädjen väger tyngst – hälften av poängen", () => {
  const vikt = Object.fromEntries(VIKTER.map((v) => [v.nyckel, v.vikt]));
  assert.equal(vikt.gladje, 0.5);
  assert.ok(Math.abs(VIKTER.reduce((s, v) => s + v.vikt, 0) - 1) < 1e-9);
  const glad = viktadPoang({ gladje: 0.9, betydelse: 0.4, farskhet: 0.5, tillit: 0.85 });
  const torr = viktadPoang({ gladje: 0.3, betydelse: 0.9, farskhet: 0.5, tillit: 0.98 });
  assert.ok(glad > torr, `${glad} > ${torr}`);
});

test("byråkratiska nyheter hamnar alltid lågt", () => {
  assert.ok(viktadPoang({ gladje: 1, betydelse: 1, farskhet: 1, tillit: 1, byrakratisk: true }) <= 25);
});

test("blandningen: aldrig fler än två av samma typ i rad, ingen typ över ~30 % av toppen, inget försvinner", () => {
  const lista = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, typ: "rymden" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, typ: "natur" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, typ: "manniskor" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, typ: "medicin" })),
  ];
  const ut = blanda(lista, { n: 9 });
  assert.equal(ut.length, lista.length);
  assert.equal(ut[0].id, "r0", "den gladaste står alltid först");
  // I toppen; längst ned kan bara en typ återstå, och då ligger de kvar i ordning i stället för att försvinna.
  for (let i = 2; i < 9; i++) assert.ok(!(ut[i].typ === ut[i - 1].typ && ut[i].typ === ut[i - 2].typ), `tre ${ut[i].typ} i rad vid ${i}`);
  assert.ok(ut.slice(0, 9).filter((a) => a.typ === "rymden").length <= Math.ceil(9 * 0.3), "rymden tar högst 30 % av toppen");
  assert.ok(Object.keys(TYPER).includes("charm"));
});
