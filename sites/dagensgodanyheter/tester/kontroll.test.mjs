import { test } from "node:test";
import assert from "node:assert/strict";
import { maskinkontroll, antalOrd } from "../scripts/lib/kontroll.mjs";

const fyll = (n, ord = "ord") => Array.from({ length: n }, (_, i) => `${ord}${i}`).join(" ");
const artikel = (over = {}) => ({
  slug: "en-bra-nyhet-idag", kategori: "vetenskap", rubrik: "Rubrik", ingress: fyll(30, "ingress"),
  avsnitt: [{ rubrik: "Ett", stycken: [fyll(150, "a")] }, { rubrik: "Två", stycken: [fyll(150, "b")] }],
  faktaruta: { rubrik: "Fakta", punkter: ["x", "y", "z"] }, varfor: fyll(30, "varfor"), ...over,
});
const kalla = "Forskarna har upptäckt en ny art av skalbagge i Västerbotten. Det är den första nya arten på tio år.";

test("godkänd artikel ger inga fel", () => {
  assert.deepEqual(maskinkontroll(artikel(), kalla), []);
  assert.ok(antalOrd(artikel()) >= 300);
});

test("för kort och för lite struktur", () => {
  const fel = maskinkontroll(artikel({ avsnitt: [{ rubrik: "Ett", stycken: ["kort"] }], faktaruta: { punkter: ["x"] } }), kalla);
  assert.ok(fel.some((f) => f.startsWith("längd")));
  assert.ok(fel.some((f) => f.includes("H2")));
  assert.ok(fel.some((f) => f.includes("faktarutan")));
});

test("påhittat citat underkänns, ordagrant citat godkänns", () => {
  const pahittat = artikel({ ingress: `${fyll(30, "i")} ”Det här är ett påhittat uttalande” sa någon.` });
  assert.ok(maskinkontroll(pahittat, kalla).some((f) => f.startsWith("citat")));
  const riktigt = artikel({ ingress: `${fyll(30, "i")} ”den första nya arten på tio år”.` });
  assert.ok(!maskinkontroll(riktigt, kalla).some((f) => f.startsWith("citat")));
});

test("tio kopierade ord i följd underkänns", () => {
  const kopia = artikel({ varfor: `${fyll(20, "v")} Forskarna har upptäckt en ny art av skalbagge i Västerbotten idag.` });
  assert.ok(maskinkontroll(kopia, kalla).some((f) => f.includes("kopierade")));
});

test("råd till läsaren underkänns men vanliga ord gör det inte", () => {
  assert.ok(maskinkontroll(artikel({ varfor: `${fyll(20, "v")} Du bör investera i fonder.` }), kalla).some((f) => f.includes("råd")));
  assert.deepEqual(maskinkontroll(artikel({ varfor: `${fyll(20, "v")} Företaget köpte en fabrik och sålde mark.` }), kalla), []);
});

test("ogiltig slug och kategori", () => {
  const fel = maskinkontroll(artikel({ slug: "Ö", kategori: "sport" }), kalla);
  assert.ok(fel.includes("ogiltig slug"));
  assert.ok(fel.includes("okänd kategori"));
});

test("kopieradeFraser hittar hela den kopierade sträckan", async () => {
  const { kopieradeFraser } = await import("../scripts/lib/kontroll.mjs");
  const kalla = "Detta är en lång mening med exakt tio ord som kopieras rakt av här och nu.";
  const a = { rubrik: "R", ingress: "Vi skriver: detta är en lång mening med exakt tio ord som kopieras rakt av här, sedan eget.", avsnitt: [], faktaruta: { punkter: [] }, varfor: "" };
  const f = kopieradeFraser(a, kalla);
  assert.equal(f.length, 1);
  assert.equal(f[0].split(" ").length, 14);
  assert.deepEqual(kopieradeFraser({ ...a, ingress: "Helt egna ord här." }, kalla), []);
});
