import { SITE, KAT, UPPDATERAD, KALLA, MED_SIDA } from "../site.js";
import { GUIDER } from "../guider.js";

export function GET() {
  const storst = [...MED_SIDA].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 30);
  const rader = [
    `# ${SITE.visningsnamn}`, "", `> ${SITE.beskrivning}`, "",
    `Uppdaterad: ${UPPDATERAD}. ${KAT.enheter.length} parkeringar i ${KAT.kommuner.length} kommuner. ${KALLA}`, "",
    "## Urval", `- [Gratis parkering](${SITE.url}/gratis-parkering/)`, `- [Parkeringshus och garage](${SITE.url}/parkeringshus/)`, `- [Pendlarparkering](${SITE.url}/pendlarparkering/)`, `- [Parkering med laddning](${SITE.url}/laddning/)`, `- [Flygplatsparkering](${SITE.url}/flygplatsparkering/)`, "",
    "## Guider", ...GUIDER.map((g) => `- [${g.namn}](${SITE.url}/guider/${g.slug}/): ${g.text}`), "",
    "## Län", ...KAT.lan.map((l) => `- [${l.namn}](${SITE.url}${l.href}): ${l.antal} parkeringar`), "",
    "## Största kommunerna", ...storst.map((k) => `- [Parkering i ${k.namn}](${SITE.url}${k.href}): ${k.enheter.length} parkeringar`), "",
    `- [Om, källor och metod](${SITE.url}/om/)`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
