// JSON-LD för namnsdagssajten utöver core: Dataset (statistiksidor) och ItemList (list- och månadssidor).
// Inget Event-schema: namnsdagar är inga evenemang med plats och arrangör.
import { SITE } from "../site.js";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
export const SCB_KALLA_LD = {
  "@type": "Organization", name: "Statistiska centralbyrån (SCB)", url: "https://www.scb.se/",
};
export const ISOF_KALLA_LD = {
  "@type": "Organization", name: "Institutet för språk och folkminnen (Isof)", url: "https://www.isof.se/",
};

/**
 * Dataset: sajtens egen sammanställning av öppna data (SCB, CC0). `filer` = nedladdningsbara JSON-filer.
 * Beskrivningen ska vara 50–5 000 tecken enligt Google.
 */
export function datasetLd({ namn, beskrivning, sokvag, tid = "1998/2022", nyckelord = [], filer = [], kallor = [SCB_KALLA_LD] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: namn,
    description: beskrivning,
    url: `${SITE.url}${sokvag}`,
    inLanguage: "sv-SE",
    isAccessibleForFree: true,
    license: CC0,
    temporalCoverage: tid,
    spatialCoverage: { "@type": "Place", name: "Sverige" },
    keywords: ["förnamn", "namnstatistik", "Sverige", ...nyckelord],
    creator: { "@type": "Organization", name: SITE.organisation, url: `${SITE.url}/` },
    isBasedOn: kallor.map((k) => k.url),
    sourceOrganization: kallor,
    ...(filer.length ? { distribution: filer.map((f) => ({ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE.url}${f}` })) } : {}),
  };
}

/** ItemList med länkar: [{ namn, href }]. Långa listor kortas till de första `max`. */
export function itemListLd(namn, poster, max = 200) {
  const xs = poster.slice(0, max);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: namn,
    numberOfItems: poster.length,
    itemListElement: xs.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.namn, url: `${SITE.url}${p.href}` })),
  };
}
