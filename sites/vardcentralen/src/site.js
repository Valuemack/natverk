import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog, veckoSammanfattning } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"vårdcentral","plur":"vårdcentraler","art":"en"};
export const SCHEMA_TYP = "MedicalClinic";
export const TITEL_ORD = "öppettider";
export const KALLA = "Uppgifterna sammanställs från öppna källor och kontrolleras varje natt. Vid akut sjukdom: ring 112. Sjukvårdsrådgivning dygnet runt: 1177.";

const lank = (href, text) => ({ __html: `<a href="${href}" rel="nofollow noopener" target="_blank">${text}</a>` });
export const KAT = laddaKatalog("data/enheter.json", {
  forbered: (e) => {
    const x = e.extra ?? {};
    const dropin = x.dropin_tider && veckoSammanfattning(x.dropin_tider);
    return {
      ...e,
      fakta: [
        x.huvudman && { namn: "Huvudman", varde: x.huvudman === "privat" ? "Privat vårdgivare (ingår i vårdvalet)" : x.huvudman === "region" ? "Regionen" : x.huvudman },
        x.vardgivare && x.vardgivare !== e.kedja && { namn: "Vårdgivare", varde: x.vardgivare },
        x.dropin === true && { namn: "Drop-in", varde: dropin ? `Ja, ${dropin}` : "Ja" },
        x.dropin === false && x.dropin_endast_provtagning && { namn: "Drop-in", varde: "Endast provtagning" },
        x.dropin === false && !x.dropin_endast_provtagning && { namn: "Drop-in", varde: "Nej, boka tid" },
        x.narakut && { namn: "Närakut", varde: "Ja" },
        x.listning === true && { namn: "Lista dig", varde: "Ja, går att välja som vårdcentral" },
        x.url_1177 && { namn: "1177", varde: lank(x.url_1177, "Kontaktkort och e-tjänster på 1177.se") },
      ].filter(Boolean),
    };
  },
});

export const SITE = {
  tema: "vard",
  tagline: "Vårdcentraler och hälsocentraler i Sverige",
  tjanstText: "Oberoende vårdguide · Akut: ring 112 · Rådgivning dygnet runt: 1177",
  kallor: ["1177 Hitta vård (Inera)","Vårdbetyg öppna data (CC BY 4.0)","Västra Götalandsregionen (CC0)","SCB"],
  namn: "Vårdcentralen",
  visningsnamn: "vårdcentralen.nu",
  url: "https://xn--vrdcentralen-tcb.nu",
  beskrivning: "Alla vårdcentraler och hälsocentraler i Sverige med adress, telefon och öppettider – hitta din närmaste vårdcentral. Uppdateras varje natt.",
  organisation: "vårdcentralen.nu",
  farg: "#1f5fa8",
  meny: [{"namn":"Byta vårdcentral","href":"/byta-vardcentral/"},{"namn":"Drop-in","href":"/drop-in/"},{"namn":"Guider","href":"/guider/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om vårdcentralen.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Uppgifterna sammanställs från öppna källor och kontrolleras varje natt. Vid akut sjukdom: ring 112. Sjukvårdsrådgivning dygnet runt: 1177.",
  natverk: [],
};
