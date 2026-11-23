// JSON-LD-byggare och robots.txt för alla sajter i nätverket.

export const abs = (site, path) => new URL(path, site.url).href;

/**
 * Metabeskrivning inom 70–160 tecken: börjar med `huvud` och lägger till delar ur `fyll`
 * (i ordning) så länge texten är under ~120 tecken och nästa del ryms. Är den för lång kortas
 * den vid ett ordslut.
 */
export function besk(huvud, ...fyll) {
  let t = String(huvud).trim();
  for (const del of fyll.flat().filter(Boolean)) {
    if (t.length >= 120) break;
    if ((t + " " + del).length <= 160) t += " " + del;
  }
  if (t.length > 160) t = t.slice(0, 157).replace(/\s+\S*$/, "") + " …";
  return t;
}

/**
 * Säkerställ att en meta-beskrivning ryms (Google visar ~155–160 tecken).
 * Tar först bort ✓-punkter bakifrån, sedan klipper vid meningsslut, sist vid ordgräns.
 */
export function kortaBesk(text, max = 160) {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  while (t.length > max && /\s✓ [^✓]*$/.test(t)) t = t.replace(/\s✓ [^✓]*$/, "").trim();
  if (t.length <= max) return t;
  const slut = t.slice(0, max).lastIndexOf(". ");
  if (slut >= 100) return t.slice(0, slut + 1);
  return t.slice(0, max - 2).replace(/\s+\S*$/, "") + " …";
}

/** Första titeln som ryms (Google visar ~60 tecken); annars den kortaste. */
export function valjTitel(...kandidater) {
  const k = kandidater.flat().filter(Boolean);
  return k.find((t) => t.length <= 60) ?? [...k].sort((a, b) => a.length - b.length)[0];
}

export const websiteLd = (site) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.namn,
  url: site.url,
  inLanguage: "sv-SE",
  description: site.beskrivning,
  publisher: { "@type": "Organization", name: site.organisation, url: site.url },
});

export const breadcrumbLd = (site, smulor) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: smulor.map((s, i) => ({
    "@type": "ListItem", position: i + 1, name: s.namn, item: abs(site, s.href),
  })),
});

export const faqLd = (fragor) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: fragor.map((f) => ({
    "@type": "Question", name: f.fraga,
    acceptedAnswer: { "@type": "Answer", text: f.svar },
  })),
});

// Bottar utan nytta för svenska sajter stängs ute; AI- och sökbottar välkomnas.
const BLOCKERADE = ["Baiduspider", "MJ12bot", "DotBot", "PetalBot", "ExaSearchBot", "Bytespider"];
const AI_BOTTAR = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot",
  "PerplexityBot", "Google-Extended", "Applebot-Extended"];

export function robotsTxt(site) {
  const rader = ["# Bottar utan nytta för svenska sajter"];
  for (const b of BLOCKERADE) rader.push(`User-agent: ${b}`, "Disallow: /", "");
  rader.push("# AI-sökmotorer och assistenter är välkomna");
  for (const b of AI_BOTTAR) rader.push(`User-agent: ${b}`, "Allow: /", "");
  rader.push("# SEO-verktyg: tillåtna men långsamt", "User-agent: AhrefsBot", "Crawl-delay: 10", "",
    "User-agent: SemrushBot", "Crawl-delay: 10", "", "User-agent: *", "Allow: /", "",
    `Sitemap: ${abs(site, "/sitemap-index.xml")}`);
  return rader.join("\n") + "\n";
}
