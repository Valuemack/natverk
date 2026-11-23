import { lang, isoVecka } from "@natverk/core/datum.js";
import { helgdagarAr, nastaHelgdag, klamdagarAr } from "../lib/helgdagar.js";
import { arbetsdagarDetalj, GRUPPER } from "../lib/ledighet.js";
import { SITE, IDAG, AR } from "../site.js";

export function GET() {
  const n = nastaHelgdag(IDAG, "rod");
  const rader = [
    `# ${SITE.visningsnamn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    `Uppdaterad: ${IDAG.toISOString().slice(0, 10)}. Idag är det vecka ${isoVecka(IDAG).vecka}. Nästa röda dag: ${n.namn}, ${lang(n.datum)}.`,
    "",
    "## Viktiga sidor",
    `- [Röda dagar ${AR}](${SITE.url}/${AR}/)`,
    `- [Röda dagar ${AR + 1}](${SITE.url}/${AR + 1}/)`,
    `- [Klämdagar ${AR + 1}](${SITE.url}/klamdagar/${AR + 1}/)`,
    `- [Arbetsdagar ${AR + 1}](${SITE.url}/arbetsdagar/${AR + 1}/): ${arbetsdagarDetalj(AR + 1).totalt.arbetsdagar} arbetsdagar`,
    ...GRUPPER.map((g) => `- [${g.namn} ${AR + 1}](${SITE.url}/${g.slug}/${AR + 1}/)`),
    `- [Vilken vecka är det?](${SITE.url}/vecka/)`,
    `- [Flaggdagar ${AR + 1}](${SITE.url}/flaggdagar/${AR + 1}/)`,
    `- [Alla helgdagar](${SITE.url}/helgdagar/)`,
    `- [Källor och metod](${SITE.url}/om/)`,
    "",
    `## Röda dagar och helgaftnar ${AR + 1}`,
    ...helgdagarAr(AR + 1).map((h) => `- ${h.namn}: ${lang(h.datum)}${h.typ === "afton" ? " (helgafton)" : ""}`),
    "",
    `## Klämdagar ${AR + 1}`,
    ...klamdagarAr(AR + 1).map((k) => `- ${lang(k.datum)} (${k.orsak.namn})`),
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
