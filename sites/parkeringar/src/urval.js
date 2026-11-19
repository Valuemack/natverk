// Urvalssidor för hela landet. Egen fil eftersom getStaticPaths inte når komponentens konstanter.
import { arGratis } from "./site.js";

export const URVAL = {
  parkeringshus: {
    namn: "Parkeringshus och garage",
    titel: (n) => `Parkeringshus och garage i Sverige – ${n} st med pris`,
    h1: "Parkeringshus och parkeringsgarage",
    filter: (e) => ["parkeringshus", "parkeringsgarage"].includes(e.typ),
    intro: (n, l) => `${n} parkeringshus och garage i ${l} län, med timpris, öppettider och höjdbegränsning där operatören anger dem.`,
    fraga: "Vad är skillnaden mellan parkeringshus och parkeringsgarage?",
    svar: "Ett parkeringshus är en egen byggnad för parkering i flera plan. Ett parkeringsgarage ligger oftast under mark eller i en annan byggnad. Kontrollera höjdbegränsningen om du har takbox eller större bil.",
  },
  "gratis-parkering": {
    namn: "Gratis parkeringar",
    titel: (n) => `Gratis parkering – ${n} avgiftsfria parkeringar i Sverige`,
    h1: "Gratis parkering i Sverige",
    filter: arGratis,
    intro: (n, l) => `${n} parkeringar i ${l} län är avgiftsfria enligt kommunernas och OpenStreetMaps uppgifter.`,
    fraga: "Gäller det ingen tidsgräns på gratis parkering?",
    svar: "Avgiftsfri betyder inte alltid fri tid. Många gratisparkeringar kräver p-skiva och har en längsta parkeringstid, till exempel 2 eller 24 timmar. Skyltningen på plats gäller alltid.",
  },
  pendlarparkering: {
    namn: "Pendlarparkeringar",
    titel: (n) => `Pendlarparkering – ${n} infartsparkeringar i Sverige`,
    h1: "Pendlarparkeringar och infartsparkeringar",
    filter: (e) => e.typ === "pendlarparkering",
    intro: (n, l) => `${n} pendlar- och infartsparkeringar i ${l} län, ofta nära tåg, buss eller tunnelbana.`,
    fraga: "Kostar det att stå på en pendlarparkering?",
    svar: "Många pendlarparkeringar är gratis eller billiga för den som reser vidare kollektivt. Vissa kräver giltig färdbiljett eller registrering, så läs skyltningen.",
  },
  laddning: {
    namn: "Parkeringar med laddplatser",
    titel: (n) => `Parkering med laddning för elbil – ${n} parkeringar`,
    h1: "Parkering med laddplatser för elbil",
    filter: (e) => e.extra?.laddplatser > 0,
    intro: (n, l) => `${n} parkeringar i ${l} län har laddplatser för elbil enligt operatörens eller kommunens uppgifter.`,
    fraga: "Kostar laddningen extra?",
    svar: "Oftast betalar du för laddningen separat, per kilowattimme, utöver parkeringsavgiften. Priset står i laddoperatörens app eller på laddstolpen.",
  },
};
