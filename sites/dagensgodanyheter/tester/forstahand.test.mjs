// Mediekällor: förstahandskällan spåras, "enligt [medium]" när den saknas, och inga nära omskrivningar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { troligaKallor, sidinfo, enligtFel } from "../scripts/lib/forstahand.mjs";
import { naraOmskrivning, omskrivningsandel } from "../scripts/lib/kontroll.mjs";

const MEDIESIDA = `<html><body><nav><a href="https://www.nature.com/nav">Nav</a></nav><article>
<p>${"Bakgrundstext om nyheten. ".repeat(30)}</p>
<p>According to <a href="https://www.nature.com/articles/s41586-026-01234-5?utm_source=feed">the study published in Nature</a>, the coral recovered.</p>
<p>The <a href="https://www.noaa.gov/news/coral-reefs-recover">agency said</a> the reef was healthy, see also <a href="https://www.reefcharity.org/projects/restoration">the charity</a>.</p>
<p>Share on <a href="https://twitter.com/intent/tweet">Twitter</a>, read <a href="https://www.theguardian.com/environment/2026/coral">the Guardian</a>,
<a href="/tag/coral">more about coral</a>, <a href="https://example-medium.com/2026/other-story">our other story</a> and <a href="https://www.nature.com/">Nature</a>.</p>
</article></body></html>`;

test("troliga förstahandskällor: studien först, sedan myndigheten och organisationen – aldrig medier, sociala medier eller egna sidor", () => {
  const l = troligaKallor(MEDIESIDA, "https://example-medium.com/2026/coral-reef", { utesluten: ["https://www.theguardian.com"] });
  assert.deepEqual(l.map((x) => x.host), ["nature.com", "noaa.gov", "reefcharity.org"]);
  assert.equal(l[0].url, "https://www.nature.com/articles/s41586-026-01234-5", "spårningsparametrar tas bort");
  assert.ok(!l.some((x) => /twitter|guardian|example-medium|\/tag\//.test(x.url)));
});

test("sidinfo läser webbplatsens namn och rubrik", () => {
  const html = '<head><meta property="og:site_name" content="NOAA"><meta property="og:title" content="Coral reefs recover"><title>x</title></head>';
  assert.deepEqual(sidinfo(html, "https://www.noaa.gov/news/a"), { namn: "NOAA", rubrik: "Coral reefs recover", hem: "https://www.noaa.gov" });
  assert.equal(sidinfo("<title>Rapport</title>", "https://www.exempel.org/r").namn, "exempel.org");
});

const artikel = (ingress, stycken = ["Ett stycke."]) => ({ ingress, avsnitt: [{ rubrik: "R", stycken }], varfor: "" });

test('utan förstahandskälla krävs "enligt [medium]" i ingressen eller första avsnittet', () => {
  assert.equal(enligtFel(artikel("Korallrevet har återhämtat sig, enligt The Guardian."), "The Guardian"), null);
  assert.equal(enligtFel(artikel("Korallrevet har återhämtat sig, enligt Guardian."), "The Guardian"), null);
  assert.equal(enligtFel(artikel("Revet växer.", ["Det skriver Positive News, och enligt Positive News är det unikt."]), "Positive News"), null);
  assert.ok(enligtFel(artikel("Korallrevet har återhämtat sig."), "The Guardian"));
});

test("nära omskrivningar underkänns, egna formuleringar går igenom", () => {
  const kalla = [
    "Forskare vid havsinstitutet har upptäckt att korallreven utanför kusten återhämtar sig snabbare än väntat efter värmeböljan.",
    "Mätningarna visar att täckningen av levande koraller ökade kraftigt under de senaste tre åren i hela området.",
    "Institutet planerar nu att utvidga övervakningen till fler rev längre söderut under nästa säsong.",
  ].join(" ");
  const nara = artikel("Forskare vid havsinstitutet har upptäckt att korallreven utanför kusten återhämtar sig betydligt snabbare än väntat efter värmeböljan.", [
    "Mätningarna visar att täckningen av levande koraller ökade tydligt under de senaste tre åren i området.",
  ]);
  const egen = artikel("Reven vid kusten mår bättre igen. Efter förra sommarens värmebölja har de levande korallerna brett ut sig på nytt, visar institutets mätningar.", [
    "Ökningen har pågått i tre år. Nästa säsong ska forskarna också följa reven längre söderut.",
  ]);
  assert.ok(naraOmskrivning(nara, kalla), `andel ${omskrivningsandel(nara, kalla)}`);
  assert.equal(naraOmskrivning(egen, kalla), null, `andel ${omskrivningsandel(egen, kalla)}`);
});

import { BYRA } from "../scripts/lib/forstahand.mjs";
import { KALLOR, AKTIVA } from "../scripts/kallor.mjs";

test("nyhetsbyråtext känns igen, vanlig text gör det inte", () => {
  for (const t of ["Stockholm (TT) Regeringen meddelade", "Text: TT\nEn ny studie", "Rubrik\nTT\nBrödtext", "NEW YORK (AP) — A new", "Reuters/Ritzau – nyheten"]) assert.ok(BYRA.test(t), t);
  for (const t of ["Forskarna i Uppsala har hittat en ny art av mossa.", "Det tog tid att få appen att fungera.", "Foto: Anna Andersson"]) assert.ok(!BYRA.test(t), t);
});

test("medier har lägre tillit än förstahandskällor, och nekade medier är avstängda", () => {
  const medier = AKTIVA.filter((k) => k.typ === "medium");
  assert.ok(medier.length >= 3);
  const lagstaForstahand = Math.min(...AKTIVA.filter((k) => k.typ !== "medium" && k.typ !== "foretag").map((k) => k.tillit));
  for (const m of medier) {
    assert.ok(m.tillit <= 0.8 && m.tillit < lagstaForstahand + 0.01, `${m.id} ${m.tillit}`);
    assert.ok(m.kortnamn, `${m.id} saknar kortnamn för "enligt …"`);
  }
  for (const id of ["guardian", "bbc", "npr", "positivenews"]) assert.equal(KALLOR.find((k) => k.id === id)?.av, true, id);
});
