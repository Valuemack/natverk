import { SITE, REGIONER, TYPER, SVERIGE, prognosFor, KALENDER_AR, kalenderFor, mmdd, UPPDATERAD } from "../site.js";

export function GET() {
  const bjork = TYPER.find((t) => t.slug === "bjork");
  const riks = SVERIGE ? prognosFor(SVERIGE) : null;
  const rader = [
    `# ${SITE.visningsnamn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    `Uppdaterad: ${UPPDATERAD}. Prognoser och mätdata: Palynologiska laboratoriet, Naturhistoriska riksmuseet (prognoser CC BY-ND 4.0, mätdata CC BY-SA 4.0).`,
    riks ? `Senaste riskprognos för hela landet gäller ${riks.start} till ${riks.slut}.` : "",
    "",
    "## Viktiga sidor",
    `- [Pollenkalender](${SITE.url}/pollenkalender/)`,
    ...TYPER.map((t) => `- [${t.namn}](${SITE.url}/pollen/${t.slug}/)`),
    "",
    "## Orter",
    ...REGIONER.map((r) => `- [Pollenprognos ${r.namn}](${SITE.url}/${r.slug}/)${bjork && kalenderFor(r, bjork) ? `: björkpollen brukar börja runt ${mmdd(kalenderFor(r, bjork).typisk_start)} (median ${KALENDER_AR[0]}–${KALENDER_AR.at(-1)})` : ""}`),
  ].filter((x) => x !== null);
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
