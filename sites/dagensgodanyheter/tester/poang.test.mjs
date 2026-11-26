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
