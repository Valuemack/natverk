// Strukturerad data för en nyhetssajt: NewsMediaOrganization, WebSite, NewsArticle, CollectionPage och BreadcrumbList.
import { abs } from "@natverk/core/seo.js";
import { SITE } from "../site.js";
import { BILDTEXT_GENERERAD } from "./bildtext.js";

export const ORG_ID = `${SITE.url}/#organisation`;

export const organisationLd = () => ({
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  "@id": ORG_ID,
  name: SITE.namn,
  url: `${SITE.url}/`,
  logo: { "@type": "ImageObject", url: `${SITE.url}/logo-512.png`, width: 512, height: 512 },
  description: SITE.beskrivning,
  inLanguage: SITE.sprak,
  publishingPrinciples: `${SITE.url}/redaktionell-policy/`,
  correctionsPolicy: `${SITE.url}/rattelser/`,
  ethicsPolicy: `${SITE.url}/redaktionell-policy/#etik`,
  verificationFactCheckingPolicy: `${SITE.url}/redaktionell-policy/#faktakontroll`,
  actionableFeedbackPolicy: `${SITE.url}/kontakt/`,
  masthead: `${SITE.url}/om/`,
  ownershipFundingInfo: `${SITE.url}/om/#agare`,
  noBylinesPolicy: `${SITE.url}/redaktionell-policy/#byline`,
  ...(SITE.epost && { email: SITE.epost }),
});

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.namn,
  url: `${SITE.url}/`,
  inLanguage: SITE.sprak,
  description: SITE.beskrivning,
  publisher: { "@id": ORG_ID },
});

export const breadcrumbLd = (smulor) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: smulor.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.namn, item: abs(SITE, s.href) })),
});

export function nyhetsartikelLd(a) {
  // Bild som ImageObject med bildtext (samma som under bilden). Artiklar utan bild: sajtens logga (ingen platshållargrafik).
  const b = a.bild;
  const genererad = Boolean(b?.genererad || b?.illustration);
  const bild = b?.fil
    ? [{
      "@type": "ImageObject",
      url: abs(SITE, b.og ?? b.fil),
      contentUrl: abs(SITE, b.og ?? b.fil),
      width: 1280,
      height: 720,
      caption: genererad ? BILDTEXT_GENERERAD : [String(b.alt ?? "").replace(/[.!]$/, ""), b.fotograf && `Foto: ${b.fotograf}`, b.licens].filter(Boolean).join(". "),
      description: b.alt,
      creditText: genererad ? SITE.namn : b.fotograf ?? b.kalla,
      ...(b.licensUrl && { license: b.licensUrl }),
    }]
    : [`${SITE.url}/logo-512.png`];
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.rubrik.slice(0, 110),
    description: a.beskrivning,
    image: bild,
    datePublished: a.publicerad,
    dateModified: a.uppdaterad ?? a.publicerad,
    inLanguage: SITE.sprak,
    articleSection: a.kat.namn,
    keywords: (a.taggar ?? []).join(", "),
    wordCount: a.ord,
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(SITE, a.href) },
    // Ingen påhittad person: artiklarna signeras av redaktionen (se /redaktionell-policy/).
    author: { "@type": "Organization", name: SITE.redaktion, url: `${SITE.url}/om/#redaktionen` },
    publisher: { "@id": ORG_ID, "@type": "NewsMediaOrganization", name: SITE.namn, logo: { "@type": "ImageObject", url: `${SITE.url}/logo-512.png` } },
    isBasedOn: { "@type": "CreativeWork", name: a.kalla.rubrik || a.kalla.namn, url: a.kalla.url, publisher: { "@type": "Organization", name: a.kalla.namn, url: a.kalla.hem } },
    citation: [a.kalla.url, ...(a.via ? [a.via.url] : []), ...(a.ovrigaKallor ?? []).map((k) => k.url), ...(a.bakgrund ?? []).map((b) => b.kalla.url)],
    ...(a.rattelser?.length && { correction: a.rattelser.map((r) => ({ "@type": "CorrectionComment", text: r.text, datePublished: r.datum })) }),
  };
}

export const samlingLd = ({ namn, beskrivning, href, artiklar }) => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: namn,
  description: beskrivning,
  url: abs(SITE, href),
  inLanguage: SITE.sprak,
  isPartOf: { "@type": "WebSite", url: `${SITE.url}/` },
  mainEntity: {
    "@type": "ItemList",
    itemListElement: artiklar.slice(0, 30).map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(SITE, a.href), name: a.rubrik })),
  },
});
