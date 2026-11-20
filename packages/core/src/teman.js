// Visuella teman per sajt: logga (inline-SVG, currentColor) och favicon.
// Färger, typsnitt och sidhuvudets stil ligger i bas.css under .tema-<namn>.
// Medvetet egna, neutrala symboler – inga myndigheters eller kedjors loggor eller färgprofiler.

const svg = (inner, vb = "0 0 32 32") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;

export const TEMAN = {
  kalender: {
    logga: svg(`<rect x="4" y="7" width="24" height="21" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M4 13h24" stroke="currentColor" stroke-width="2.5"/><path d="M11 4v6M21 4v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><rect x="18" y="17" width="6" height="6" rx="1" fill="currentColor"/>`),
    favicon: { bg: "#8f1d16", fg: "#fff" },
  },
  apotek: {
    logga: svg(`<circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M13 8.5h6v4.5h4.5v6H19v4.5h-6V19H8.5v-6H13z" fill="currentColor"/>`),
    favicon: { bg: "#0b7a4b", fg: "#fff" },
  },
  vard: {
    logga: svg(`<path d="M16 27.5S4 20.3 4 12.2A6.2 6.2 0 0 1 16 9a6.2 6.2 0 0 1 12 3.2c0 8.1-12 15.3-12 15.3z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M7.5 16h5l1.8-3.5 3 6.5 1.8-3h5.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
    favicon: { bg: "#17457a", fg: "#fff" },
  },
  bibliotek: {
    logga: svg(`<path d="M16 9.5C13 7 8.5 6.5 4 7.5v17c4.5-1 9-.5 12 2 3-2.5 7.5-3 12-2v-17c-4.5-1-9-.5-12 2z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 9.5v17" stroke="currentColor" stroke-width="2.4"/>`),
    favicon: { bg: "#4a2a5e", fg: "#fff" },
  },
  vatten: {
    logga: svg(`<circle cx="22" cy="9" r="4" fill="currentColor"/><path d="M3 18c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4 2M3 24c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
    favicon: { bg: "#0b5f86", fg: "#fff" },
  },
  loppis: {
    logga: svg(`<path d="M6 12h20l-2 15H8z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M11 12a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="19.5" r="2.5" fill="currentColor"/>`),
    favicon: { bg: "#9a4b14", fg: "#fff" },
  },
  skola: {
    logga: svg(`<path d="M16 5 3 11l13 6 13-6z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 14v7c2.5 2.5 13.5 2.5 16 0v-7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M29 11v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
    favicon: { bg: "#1d5c63", fg: "#fff" },
  },
  vuxen: {
    logga: svg(`<path d="M5 8.5c3.5-1.2 7.5-1 11 1.5v17c-3.5-2.5-7.5-2.7-11-1.5z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M16 10v17" stroke="currentColor" stroke-width="2.3"/><path d="m20.5 21 6-13.5 2.5 1.1-6 13.5-3 1.9z" fill="currentColor"/>`),
    favicon: { bg: "#3b3f8f", fg: "#fff" },
  },
  sim: {
    logga: svg(`<circle cx="21" cy="8" r="3.2" fill="currentColor"/><path d="M5 17.5 13 12l4 4.5 5-3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 23c2.2 0 2.2-1.8 4.4-1.8s2.2 1.8 4.4 1.8 2.2-1.8 4.4-1.8 2.2 1.8 4.4 1.8 2.2-1.8 4.4-1.8 2.2 1.8 4 1.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3 28h26" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>`),
    favicon: { bg: "#007c91", fg: "#fff" },
  },
  pollen: {
    logga: svg(`<circle cx="16" cy="16" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M16 4v4.5M16 23.5V28M4 16h4.5M23.5 16H28M7.5 7.5l3.2 3.2M21.3 21.3l3.2 3.2M7.5 24.5l3.2-3.2M21.3 10.7l3.2-3.2"/></g>`),
    favicon: { bg: "#2e4a1f", fg: "#f2c94c" },
  },
  bensin: {
    logga: svg(`<path d="M6 27V7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v20M4 27h17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="8.5" width="7" height="5" rx="1" fill="currentColor"/><path d="M19 12h2.5a2 2 0 0 1 2 2v7a1.8 1.8 0 0 0 3.6 0V11l-3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`),
    favicon: { bg: "#1f3a5f", fg: "#f2c230" },
  },
  trafik: {
    logga: svg(`<rect x="5" y="5" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12.5 23V10h5a4 4 0 0 1 0 8h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>`),
    favicon: { bg: "#1659a8", fg: "#fff" },
  },
  natur: {
    logga: svg(`<path d="M16 4 7 17h5l-5 8h18l-5-8h5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 25v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
    favicon: { bg: "#2f6b2f", fg: "#fff" },
  },
  // Prisskylt (dagensbensinpris.se): en prisskylt på stolpe med siffror och en kurva.
  prisskylt: {
    logga: svg(`<rect x="4" y="3.5" width="24" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 15.5l4.5-4.5 3.5 3 6.5-6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 20.5V29M11 29h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`),
    favicon: { bg: "#23272d", fg: "#ffb21a" },
  },
  // Jour (jourapotek.se): halvmåne och klocka – öppet när andra har stängt.
  jour: {
    logga: svg(`<path d="M19 4.5a11.5 11.5 0 1 0 8.5 15.8A9.5 9.5 0 0 1 19 4.5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M14.5 12v5.5l3.5 2.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
    favicon: { bg: "#14213d", fg: "#7ee0c3" },
  },
};

/** Favicon-SVG med temats symbol i vitt på färgad ruta. */
export function faviconSvg(tema) {
  const t = TEMAN[tema] ?? TEMAN.kalender;
  const inner = t.logga.replace(/^<svg[^>]*>|<\/svg>$/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${t.favicon.bg}"/><g transform="translate(4 4) scale(.75)" color="${t.favicon.fg}">${inner}</g></svg>\n`;
}
