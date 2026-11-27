import { SITE, KAT, UPPDATERAD, KALLA } from "../site.js";
import { GUIDER } from "../guider.js";

export function GET() {
  const storst = [...KAT.sidKommuner].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 25);
  const rader = [
    `# ${SITE.visningsnamn}`, "", `> ${SITE.beskrivning}`, "",
    `Uppdaterad: ${UPPDATERAD}. ${KAT.enheter.length} loppisar och second hand-butiker i ${KAT.kommuner.length} kommuner. ${KALLA}`, "",
    "## Län", ...KAT.lan.map((l) => `- [${l.namn}](${SITE.url}${l.href}): ${l.antal} butiker`), "",
    "## Största kommunerna", ...storst.map((k) => `- [${k.namn}](${SITE.url}${k.href}): ${k.enheter.length} butiker`), "",
    "## Guider", ...GUIDER.map((g) => `- [${g.namn}](${SITE.url}${g.href}): ${g.text}`), "",
    `- [Om, källor och metod](${SITE.url}/om/)`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
