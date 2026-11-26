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
    "Svensk nyhetssajt med enbart positiva nyheter. Varje artikel bygger på en namngiven förstahandskälla (myndighet, lärosäte, forskningsinstitut eller internationell organisation) som länkas i artikeln. Artiklarna skrivs med egna ord och faktagranskas mot källtexten före publicering. Andra tidningars artiklar skrivs aldrig om.",
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
    "## Mest läsvärt just nu",
    ...efterLasvarde(veckan.length ? veckan : ARTIKLAR).slice(0, 15).map((a) => `- [${a.rubrik}](${SITE.url}${a.href}) (${a.kat.namn}, ${datumText(a.publicerad)}; källa: ${a.kalla.namn}): ${a.ingress}`),
    "",
    "## Flöden",
    `- RSS: ${SITE.url}/rss.xml`,
    `- Nyhetssitemap (48 timmar): ${SITE.url}/nyhetssitemap.xml`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
