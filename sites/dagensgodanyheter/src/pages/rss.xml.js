// RSS 2.0 med de 50 senaste artiklarna.
import { SITE } from "../site.js";
import { ARTIKLAR } from "../lib/artiklar.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const poster = ARTIKLAR.slice(0, 50).map((a) => `    <item>
      <title>${x(a.rubrik)}</title>
      <link>${SITE.url}${a.href}</link>
      <guid isPermaLink="true">${SITE.url}${a.href}</guid>
      <pubDate>${new Date(a.publicerad).toUTCString()}</pubDate>
      <category>${x(a.kat.namn)}</category>
      <description>${x(a.ingress)} Källa: ${x(a.kalla.namn)}.</description>
      <enclosure url="${SITE.url}${a.ogBild}" type="${a.ogBild.endsWith(".jpg") ? "image/jpeg" : "image/svg+xml"}" length="0" />
    </item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${x(SITE.namn)}</title>
    <link>${SITE.url}/</link>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${x(SITE.beskrivning)}</description>
    <language>sv-se</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${poster}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
