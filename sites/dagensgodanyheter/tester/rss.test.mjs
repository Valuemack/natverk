import { test } from "node:test";
import assert from "node:assert/strict";
import { tolkaFlode, hittaFloden } from "../scripts/lib/rss.mjs";

test("RSS 2.0 med CDATA, datum och bild", () => {
  const xml = `<rss><channel><item><title><![CDATA[Ny forskning &amp; hopp]]></title><link>https://ex.se/a</link>
    <pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;Text&lt;/p&gt;</description>
    <enclosure url="https://ex.se/b.jpg" type="image/jpeg"/></item>
    <item><title>Utan länk</title></item></channel></rss>`;
  const p = tolkaFlode(xml);
  assert.equal(p.length, 1);
  assert.equal(p[0].titel, "Ny forskning & hopp");
  assert.equal(p[0].lank, "https://ex.se/a");
  assert.equal(p[0].datum, "2026-11-24T08:00:00.000Z");
  assert.equal(p[0].sammanfattning, "Text");
  assert.equal(p[0].bild, "https://ex.se/b.jpg");
});

test("Atom med alternate-länk", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Rubrik</title>
    <link rel="self" href="https://ex.se/self"/><link rel="alternate" href="https://ex.se/sida"/>
    <updated>2026-11-20T10:00:00Z</updated><summary>Kort</summary></entry></feed>`;
  const p = tolkaFlode(xml);
  assert.equal(p[0].lank, "https://ex.se/sida");
  assert.equal(p[0].datum, "2026-11-20T10:00:00.000Z");
});

test("hittar flödeslänkar i HTML", () => {
  const html = `<head><link rel="alternate" type="application/rss+xml" href="/feed/"><link rel="stylesheet" href="/s.css"></head>`;
  assert.deepEqual(hittaFloden(html, "https://ex.se/nyheter/"), ["https://ex.se/feed/"]);
});
