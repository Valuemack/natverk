// Trender är en idékälla, aldrig en nyhetskälla: de ger bara en liten aktualitetsbonus åt kandidater från våra
// förstahandskällor, och negativa trender används inte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tolkaTrendRss, anvandbara, mojligaTrender, allmannaNycklar, nyckelordsplanerare } from "../scripts/trender.mjs";
import { viktadPoang, AKTUALITET_MAX } from "../src/lib/vikter.js";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RSS = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
<item><title>hera spacecraft</title><ht:approx_traffic>2000+</ht:approx_traffic>
<ht:news_item><ht:news_item_title><![CDATA[Hera sends first images of Dimorphos &amp; Didymos]]></ht:news_item_title></ht:news_item></item>
<item><title>thanksgiving</title><ht:approx_traffic>100+</ht:approx_traffic></item>
</channel></rss>`;

test("Google Trends-flödet tolkas", () => {
  const t = tolkaTrendRss(RSS, "GB");
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { term: "hera spacecraft", kalla: "google-GB", trafik: "2000+", nyheter: ["Hera sends first images of Dimorphos & Didymos"] });
});

test("negativa trender används inte", () => {
  const logg = { trender: [{ term: "a", ton: "positiv" }, { term: "b", ton: "negativ" }, { term: "c", ton: "neutral" }, { term: "d" }] };
  assert.deepEqual(anvandbara(logg).map((t) => t.term), ["a", "c"]);
});

const TRENDER = [
  { term: "hera spacecraft", ton: "positiv", nyckelord: ["Hera", "Dimorphos", "2026", "november"] },
  { term: "Sverige", ton: "neutral", nyckelord: ["Sverige", "regering"] },
];

test("matchningen kräver ett specifikt ord, inte årtal, månader eller allmänna ord", () => {
  assert.deepEqual(mojligaTrender({ titel: "Hera's first images of asteroid Dimorphos", sammanfattning: "" }, TRENDER), ["hera spacecraft"]);
  assert.deepEqual(mojligaTrender({ titel: "Ny rapport i november 2026", sammanfattning: "" }, TRENDER), []);
  assert.deepEqual(mojligaTrender({ titel: "Sverige får mer vindkraft", sammanfattning: "" }, TRENDER), []);
  assert.deepEqual(mojligaTrender({ titel: "Herakles på museum", sammanfattning: "" }, TRENDER), [], "hela ord, inte delar av ord");
});

test("nyckelord som träffar många kandidater räknas som allmänna", () => {
  const kandidater = Array.from({ length: 10 }, (_, i) => ({ titel: `Dimorphos nyhet ${i}`, sammanfattning: "" }));
  const ignorera = allmannaNycklar(kandidater, TRENDER);
  assert.ok(ignorera.has("dimorphos"));
  assert.deepEqual(mojligaTrender(kandidater[0], TRENDER, { ignorera }), []);
});

test("aktualitetsbonusen är liten och kan aldrig ensam ge en hög poäng", () => {
  const bas = { positiv: 0.8, hopp: 0.8, betydelse: 0.6, farskhet: 0.9, tillit: 0.9 };
  assert.equal(viktadPoang({ ...bas, aktualitet: 1 }) - viktadPoang(bas), AKTUALITET_MAX);
  assert.ok(AKTUALITET_MAX <= 5);
  assert.ok(viktadPoang({ positiv: 0, hopp: 0, betydelse: 0, farskhet: 0, tillit: 0, aktualitet: 1 }) <= AKTUALITET_MAX);
});

test("kandidater kommer bara från förstahandskällorna, aldrig från trenderna", () => {
  const hamta = readFileSync(join(ROT, "scripts", "hamta.mjs"), "utf8");
  // Trenderna får bara sätta förslag, trendnamn och bonus på befintliga kandidater – aldrig lägga till nya.
  assert.doesNotMatch(hamta, /(unika|kandidater)\.push\([^)]*trend/i);
  const trender = readFileSync(join(ROT, "scripts", "trender.mjs"), "utf8");
  assert.doesNotMatch(trender, /kandidater\.json/);
});

test("Keyword Planner hoppas över utan nycklar", async () => {
  const sparat = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("GOOGLE_ADS_")));
  for (const k of Object.keys(sparat)) delete process.env[k];
  try {
    const r = await nyckelordsplanerare(["rymden"]);
    assert.equal(r.status, "hoppad");
    assert.ok(r.saknas.includes("GOOGLE_ADS_DEVELOPER_TOKEN"));
  } finally { Object.assign(process.env, sparat); }
});
