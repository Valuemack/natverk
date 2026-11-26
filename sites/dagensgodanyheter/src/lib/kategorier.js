// Kategorierna (avdelningarna). Färgen används diskret, bara i små vinjetter. Delas av sajten och skripten. Slug = URL-segment, ändras aldrig.
export const KATEGORIER = [
  { slug: "inrikes", namn: "Inrikes", kort: "Inrikes", farg: "#a13a1f", ingress: "Goda nyheter från Sverige: beslut, framsteg och initiativ som gör vardagen bättre, hämtade direkt från myndigheter, kommuner, regioner och lärosäten." },
  { slug: "utrikes", namn: "Utrikes", kort: "Utrikes", farg: "#1f5a78", ingress: "Positiva nyheter från hela världen, från FN-organ, EU och internationella forskningsinstitut – sådant som sällan når förstasidorna." },
  { slug: "vetenskap", namn: "Vetenskap", kort: "Vetenskap", farg: "#4f3f8c", ingress: "Upptäckter och genombrott inom forskningen, från rymden till cellen. Varje artikel bygger på lärosätets eller forskningsinstitutets eget pressmeddelande eller den publicerade studien." },
  { slug: "teknik", namn: "Teknik", kort: "Teknik", farg: "#2c5276", ingress: "Ny teknik som löser verkliga problem: energi, transporter, medicinteknik och digitala verktyg – med källan länkad i varje artikel." },
  { slug: "miljo", namn: "Miljö & klimat", kort: "Miljö", farg: "#2a6544", ingress: "Framsteg för klimatet och miljön: renare luft och vatten, förnybar energi och arter som återhämtar sig, med data från miljömyndigheter och forskning." },
  { slug: "halsa", namn: "Hälsa", kort: "Hälsa", farg: "#97304c", ingress: "Hoppfulla nyheter om hälsa och medicin från forskning och myndigheter. Vi ger aldrig medicinska råd – vänd dig till 1177 eller vården för frågor om din egen hälsa." },
  { slug: "ekonomi", namn: "Ekonomi & börs", kort: "Ekonomi", farg: "#7a5a0e", ingress: "Fakta om ekonomin från SCB, Riksbanken, Eurostat och andra officiella källor. Här finns bara fakta – aldrig investeringsråd eller köp- och säljrekommendationer." },
  { slug: "djur-natur", namn: "Djur & natur", kort: "Djur & natur", farg: "#4a6724", ingress: "Djur som återvänder, skyddade områden och naturens comeback – från naturvårdsmyndigheter, djurparker med bevarandeprogram och forskare i fält." },
  { slug: "kultur", namn: "Kultur", kort: "Kultur", farg: "#7d3c70", ingress: "Kulturarv som räddas, fynd som berättar om vår historia och kultur som når fler – från museer, arkiv och kulturmyndigheter." },
];

export const KAT = Object.fromEntries(KATEGORIER.map((k) => [k.slug, k]));
export const KAT_SLUGS = KATEGORIER.map((k) => k.slug);
