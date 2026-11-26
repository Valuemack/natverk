// Minimal RSS 2.0/Atom/RDF-tolk utan beroenden. Returnerar { titel, lank, datum, sammanfattning, bild }.
import { avkoda, textAvHtml } from "./natet.mjs";

const tagg = (xml, namn) => {
  const m = xml.match(new RegExp(`<${namn}(?:\\s[^>]*)?>([\\s\\S]*?)</${namn}>`, "i"));
  return m ? m[1] : "";
};
const attr = (s, namn) => (s.match(new RegExp(`${namn}\\s*=\\s*"([^"]*)"`, "i")) || s.match(new RegExp(`${namn}\\s*=\\s*'([^']*)'`, "i")) || [])[1];

function datumAv(s) {
  const t = avkoda(s).trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function bildAv(post) {
  const media = post.match(/<media:(?:content|thumbnail)[^>]*>/i);
  if (media) { const u = attr(media[0], "url"); if (u) return avkoda(u); }
  const enc = post.match(/<enclosure[^>]*type\s*=\s*["']image[^>]*>/i);
  if (enc) { const u = attr(enc[0], "url"); if (u) return avkoda(u); }
  const img = avkoda(post).match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return img ? img[1] : null;
}

export function tolkaFlode(xml) {
  const s = String(xml);
  const atom = /<feed[\s>]/i.test(s) && /<entry[\s>]/i.test(s);
  const poster = atom ? s.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [] : s.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return poster.map((p) => {
    let lank = "";
    if (atom) {
      const lankar = p.match(/<link[^>]*>/gi) || [];
      const alt = lankar.find((l) => !/rel\s*=/.test(l) || /rel\s*=\s*["']alternate/.test(l)) || lankar[0] || "";
      lank = attr(alt, "href") || "";
    } else {
      lank = textAvHtml(tagg(p, "link")) || attr((p.match(/<link[^>]*>/i) || [""])[0], "href") || textAvHtml(tagg(p, "guid"));
    }
    const sammanfattningHtml = tagg(p, "description") || tagg(p, "summary") || tagg(p, "content:encoded") || tagg(p, "content");
    return {
      titel: textAvHtml(avkoda(tagg(p, "title"))).replace(/\s+/g, " ").trim(),
      lank: avkoda(lank).trim(),
      datum: datumAv(tagg(p, "pubDate") || tagg(p, "published") || tagg(p, "updated") || tagg(p, "dc:date")),
      sammanfattning: textAvHtml(avkoda(sammanfattningHtml)).replace(/\s+/g, " ").slice(0, 1200).trim(),
      bild: bildAv(p),
    };
  }).filter((p) => p.titel && /^https?:\/\//.test(p.lank));
}

/** Hittar flödesadresser i en HTML-sida (<link rel="alternate" type="application/rss+xml">). */
export function hittaFloden(html, bas) {
  return (String(html).match(/<link[^>]+>/gi) || [])
    .filter((l) => /rel\s*=\s*["']alternate/i.test(l) && /application\/(rss|atom)\+xml/i.test(l))
    .map((l) => { try { return new URL(avkoda(attr(l, "href") || ""), bas).href; } catch { return null; } })
    .filter(Boolean);
}
