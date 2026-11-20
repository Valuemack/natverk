import { SITE, MED_TIDER, KOMMUNER, HELGDAGAR, helgStatus, senastVardag, oppetDag, datumTextAr } from "../site.js";

export function GET() {
  const n = (h) => MED_TIDER.filter((a) => senastVardag(a) >= h * 60).length;
  const dygnet = MED_TIDER.filter((a) => a.dygnet);
  const h = HELGDAGAR[0], hs = helgStatus(h.nasta);
  const rader = [
    `# ${SITE.visningsnamn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    `- ${MED_TIDER.length} apotek med publicerade öppettider i ${KOMMUNER.length} kommuner (Läkemedelsverkets register och kedjornas apotekssök, uppdateras varje natt).`,
    `- Öppet till minst 21 på vardagar: ${n(21)} apotek. Till 22: ${n(22)}. Söndagsöppna: ${MED_TIDER.filter((a) => oppetDag(a, "sun")).length}.`,
    `- Öppet dygnet runt: ${dygnet.length ? dygnet.map((a) => `${a.namn}, ${a.adress}`).join("; ") : "inga"}.`,
    `- Nästa helgdag: ${h.namn} ${datumTextAr(h.nasta)}. ${hs.length ? `${hs.filter((x) => x.oppet).length} av ${hs.length} apotek med publicerade tider har öppet.` : "Tider ej publicerade ännu."}`,
    "- Sajten ger inga medicinska råd. Sjukvårdsrådgivning: 1177. Akut: 112.",
    "",
    "## Viktiga sidor",
    `- [Apotek öppet nu](${SITE.url}/oppet-nu/)`,
    `- [Apotek med öppet sent](${SITE.url}/oppet-sent/)`,
    `- [Söndagsöppna apotek](${SITE.url}/sondagsoppet/)`,
    `- [Apotek på helgdagar](${SITE.url}/helgdagar/)`,
    `- [Apotek öppet dygnet runt](${SITE.url}/dygnet-runt/)`,
    `- [Jourapotek per kommun](${SITE.url}/kommuner/)`,
    `- [Källor och metod](${SITE.url}/om/)`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
