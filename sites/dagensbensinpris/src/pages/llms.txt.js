import { SITE, LP_DATUM, DRIVMEDEL, idagPris, LISTKEDJOR, kedjePris, SENASTE_VECKA, skattedelar, datumText, AR } from "../site.js";

export function GET() {
  const v = SENASTE_VECKA, s = skattedelar();
  const rader = [
    `# ${SITE.visningsnamn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    `Dagens pris (${datumText(LP_DATUM)}), snitt av kedjornas listpriser inkl. moms:`,
    ...DRIVMEDEL.filter((d) => idagPris(d.nyckel) != null).map((d) => `- ${d.namn}: ${idagPris(d.nyckel).toFixed(2).replace(".", ",")} ${d.enhet}`),
    "",
    "Per kedja (bensin 95):",
    ...LISTKEDJOR.map((c) => `- ${c}: ${kedjePris(c, "bensin95")?.toFixed(2).replace(".", ",")} kr/l`),
    "",
    `Genomsnittligt pumppris i Sverige veckan som började ${datumText(v.datum)} (EU-kommissionen): 95 ${v.b95.toFixed(2).replace(".", ",")} kr/l, diesel ${v.diesel.toFixed(2).replace(".", ",")} kr/l. Skatt utgör ${Math.round(s.andelSkatt * 100)} % av priset för 95.`,
    "",
    "## Viktiga sidor",
    `- [Bensinpris idag](${SITE.url}/)`,
    `- [Dieselpris idag](${SITE.url}/diesel/)`,
    `- [Bensinprisets historik sedan 2005](${SITE.url}/historik/)`,
    `- [Bensinpriset ${AR}](${SITE.url}/historik/${AR}/)`,
    `- [Bensinpris i Europa](${SITE.url}/europa/)`,
    `- [Bensinpris per kommun](${SITE.url}/ort/)`,
    `- [Vad består bensinpriset av?](${SITE.url}/guider/vad-bestar-bensinpriset-av/)`,
    `- [Bränslekalkylator](${SITE.url}/rakna/)`,
    `- [Källor och metod](${SITE.url}/om/)`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
