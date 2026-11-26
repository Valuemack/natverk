import { test } from "node:test";
import assert from "node:assert/strict";
import { tolkaRobots, tillatet, textAvHtml, avkoda } from "../scripts/lib/natet.mjs";

test("robots: vår egen grupp går före *", () => {
  const r = tolkaRobots("User-agent: *\nDisallow: /\n\nUser-agent: goda-nyheter-hamtare\nDisallow: /privat/\n");
  assert.equal(tillatet(r, "/nyheter/"), true);
  assert.equal(tillatet(r, "/privat/x"), false);
});

test("robots: längsta regel vinner, Allow vinner vid lika längd", () => {
  const r = tolkaRobots("User-agent: *\nDisallow: /w/\nAllow: /w/load.php?\n");
  assert.equal(tillatet(r, "/w/api.php?action=query"), false);
  assert.equal(tillatet(r, "/w/load.php?x=1"), true);
  const lika = tolkaRobots("User-agent: *\nDisallow: /a\nAllow: /a\n");
  assert.equal(tillatet(lika, "/a"), true);
});

test("robots: jokertecken och $", () => {
  const r = tolkaRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /sok*\n");
  assert.equal(tillatet(r, "/fil.pdf"), false);
  assert.equal(tillatet(r, "/fil.pdf?x"), true);
  assert.equal(tillatet(r, "/soka"), false);
});

test("robots: tom Disallow och kommentarer", () => {
  const r = tolkaRobots("# kommentar\nUser-agent: *\nDisallow:\n");
  assert.equal(tillatet(r, "/vad/som/helst"), true);
  assert.equal(tillatet([], "/"), true);
});

test("robots: flera user-agent-rader delar grupp", () => {
  const r = tolkaRobots("User-agent: GPTBot\nUser-agent: *\nDisallow: /api/\n");
  assert.equal(tillatet(r, "/api/x"), false);
});

test("text: entiteter och HTML", () => {
  assert.equal(avkoda("&aring;&auml;&ouml; &#8211; &#x2014;"), "åäö – —");
  assert.equal(textAvHtml("<p>Hej <b>du</b></p><script>x()</script><p>två</p>"), "Hej du \ntvå");
});
