// Google Nyheter-sitemap: bara artiklar publicerade de senaste 48 timmarna (Google: "två dagar"), högst 1 000.
// En tom urlset är tillåten när inget nytt har publicerats.
import { SITE } from "../site.js";
import { senaste } from "../lib/artiklar.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function GET() {
  const urlar = senaste(48).slice(0, 1000).map((a) => `  <url>
    <loc>${SITE.url}${a.href}</loc>
    <news:news>
      <news:publication>
        <news:name>${x(SITE.namn)}</news:name>
        <news:language>sv</news:language>
      </news:publication>
      <news:publication_date>${a.publicerad}</news:publication_date>
      <news:title>${x(a.rubrik)}</news:title>
    </news:news>
  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlar}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
