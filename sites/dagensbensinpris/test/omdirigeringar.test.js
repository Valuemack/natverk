// dagensbensinpris.se är en ren omdirigeringssajt: varje gammal URL ska få en äkta 301 till bensinstationer.nu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { regler, nySokvag, NY } from "../scripts/bygg.mjs";

const gamla = readFileSync(new URL("../data/gamla-url.txt", import.meta.url), "utf8").split(/\r?\n/).filter(Boolean);

test("alla 372 gamla URL:er har en regel", () => {
  assert.equal(gamla.length, 372);
  const fran = new Set(regler().map(([f]) => f));
  for (const u of gamla) assert.ok(fran.has(u), u);
  assert.equal(fran.size, regler().length, "dubbletter");
  assert.ok(regler().length <= 2000);
});

test("rätt mål för prissidorna och kommunsidorna", () => {
  assert.equal(nySokvag("/"), "/"); // Search Consoles adressändring kräver startsida → startsida
  assert.equal(nySokvag("/diesel/"), "/dieselpris/");
  assert.equal(nySokvag("/e85/"), "/drivmedel/e85/");
  assert.equal(nySokvag("/ort/angelholm/"), "/angelholm/");
  assert.equal(nySokvag("/historik/2019/"), "/historik/2019/");
  assert.equal(nySokvag("/guider/reduktionsplikt/"), "/guider/reduktionsplikt/");
});

const bs = new URL("../../bensinstationer/dist/", import.meta.url);
test("varje mål finns på bensinstationer.nu", { skip: !existsSync(bs) && "bensinstationer är inte byggd" }, () => {
  for (const [, till] of regler()) {
    const p = new URL(`.${till}`, bs);
    assert.ok(existsSync(p) && (till.endsWith("/") ? existsSync(new URL("index.html", p)) : true), `${NY}${till}`);
  }
});
