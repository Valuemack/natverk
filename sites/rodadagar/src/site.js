import { idagStockholm, iso } from "@natverk/core/datum.js";

export const IDAG = idagStockholm();
export const AR = IDAG.getUTCFullYear();
/** År som får egna sidor: två bakåt, sex framåt. */
export const AR_LISTA = Array.from({ length: 9 }, (_, i) => AR - 2 + i);
/** År som visas i datumtabeller på helgdagssidor. */
export const TABELL_AR = Array.from({ length: 10 }, (_, i) => AR - 1 + i);
export const UPPDATERAD = iso(IDAG);

export const SITE = {
  tema: "kalender",
  tagline: "Helgdagar och kalender för Sverige",
  tjanstText: "Oberoende kalendertjänst · Beräknat enligt lag (1989:253)",
  kallor: ["Lag (1989:253) om allmänna helgdagar","Förordning (1982:270) om allmänna flaggdagar","Semesterlagen (1977:480)"],
  namn: "Röda dagar",
  visningsnamn: "rödadagar.nu",
  url: "https://xn--rdadagar-n4a.nu",
  beskrivning: "Alla röda dagar, helgdagar, klämdagar, flaggdagar och veckonummer i Sverige – uträknade enligt lag och uppdaterade varje dag.",
  organisation: "rödadagar.nu",
  farg: "#b3261e",
  meny: [
    { namn: `Röda dagar ${AR}`, href: `/${AR}/` },
    { namn: `${AR + 1}`, href: `/${AR + 1}/` },
    { namn: "Klämdagar", href: "/klamdagar/" },
    { namn: "Vecka", href: "/vecka/" },
    { namn: "Flaggdagar", href: "/flaggdagar/" },
    { namn: "Alla helgdagar", href: "/helgdagar/" },
  ],
  sidfot: [
    { namn: "Om rödadagar.nu", href: "/om/" },
    { namn: "Källor och metod", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Datumen räknas fram enligt lag (1989:253) om allmänna helgdagar och förordning (1982:270) om allmänna flaggdagar.",
  natverk: [],
};
