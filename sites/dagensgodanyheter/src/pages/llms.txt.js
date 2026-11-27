import { SITE } from "../site.js";
import { KATEGORIER } from "../lib/kategorier.js";
import { ARTIKLAR, efterLasvarde, senaste, datumText } from "../lib/artiklar.js";

export function GET() {
  const veckan = senaste(24 * 7);
  const rader = [
    `# ${SITE.namn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    "Svensk nyhetssajt med enbart positiva nyheter. Vi bygger på förstahandskällor (myndigheter, lärosäten, forskningsinstitut och organisationer) och etablerade medier, och länkar alltid till källan. När en nyhet kommer via ett medium spåras originalet bakom den, och båda länkas. Artiklarna skrivs med egna ord och faktagranskas mot källtexterna före publicering.",
    "",
    "## Om sajten",
    `- [Redaktionell policy: källor och faktakontroll](${SITE.url}/redaktionell-policy/)`,
    `- [Rättelsepolicy](${SITE.url}/rattelser/)`,
    `- [Alla källor](${SITE.url}/kallor/)`,
    `- [Om oss](${SITE.url}/om/)`,
    "",
    "## Avdelningar",
    ...KATEGORIER.map((k) => `- [${k.namn}](${SITE.url}/${k.slug}/): ${k.ingress}`),
    `- [Glada nyheter idag](${SITE.url}/glada-nyheter-idag/)`,
    `- [Veckans positiva nyheter](${SITE.url}/positiva-nyheter/)`,
    "",
    "## Dagens bästa",
    ...efterLasvarde((veckan.length ? veckan : ARTIKLAR).filter((a) => !a.poang?.byrakratisk)).slice(0, 15).map((a) => `- [${a.rubrik}](${SITE.url}${a.href}) (${a.kat.namn}, ${datumText(a.publicerad)}; källa: ${a.kalla.namn}): ${a.ingress}`),
    "",
    "## Flöden",
    `- RSS: ${SITE.url}/rss.xml`,
    `- Nyhetssitemap (48 timmar): ${SITE.url}/nyhetssitemap.xml`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
