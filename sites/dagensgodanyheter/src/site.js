import { KATEGORIER } from "./lib/kategorier.js";

/** Sajtens löfte. Formulerat så att det går att belägga: trenderna visas med data och källa i "Världen i siffror". */
export const SLOGAN = "Världen blir bättre – här är beviset, varje morgon.";

export const SITE = {
  namn: "Dagens goda nyheter",
  visningsnamn: "Dagens goda nyheter",
  url: "https://dagensgodanyheter.se",
  domän: "dagensgodanyheter.se",
  tagline: SLOGAN,
  beskrivning: "Goda nyheter från Sverige och hela världen, varje morgon: framsteg inom vetenskap, miljö, hälsa, teknik och samhälle – skrivna med egna ord utifrån förstahandskällor och faktagranskade.",
  organisation: "Dagens goda nyheter",
  redaktion: "Redaktionen, Dagens goda nyheter",
  farg: "#0d5c3f",
  sprak: "sv-SE",
  // E-post och utgivare fylls i av ägaren (se rapporten). Tills dess visas kontaktformulärets ersättning.
  epost: process.env.PUBLIC_KONTAKT_EPOST || null,
  utgivare: process.env.PUBLIC_UTGIVARE || null,
  meny: KATEGORIER.map((k) => ({ namn: k.namn, href: `/${k.slug}/` })),
  sidfot: [
    { namn: "Om oss", href: "/om/" },
    { namn: "Redaktionell policy", href: "/redaktionell-policy/" },
    { namn: "Rättelser", href: "/rattelser/" },
    { namn: "Källor", href: "/kallor/" },
    { namn: "Kontakt", href: "/kontakt/" },
    { namn: "Integritet", href: "/integritet/" },
    { namn: "RSS", href: "/rss.xml" },
  ],
};
