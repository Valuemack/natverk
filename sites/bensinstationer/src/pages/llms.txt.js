import { SITE, KAT, ORD, UPPDATERAD, KALLA } from "../site.js";
import { LP_DATUM, DRIVMEDEL, idagPris, LISTKEDJOR, kedjePris, SENASTE_VECKA, skattedelar, datumText, AR } from "../pris.js";
import { GUIDER } from "../guider.js";

export function GET() {
  const storst = [...KAT.kommuner].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 25);
  const v = SENASTE_VECKA, s = skattedelar();
  const t = (x) => x.toFixed(2).replace(".", ",");
  const rader = [
    `# ${SITE.visningsnamn}`, "", `> ${SITE.beskrivning}`, "",
    `Uppdaterad: ${UPPDATERAD}. ${KAT.enheter.length} ${ORD.plur} i ${KAT.kommuner.length} kommuner. ${KALLA}`, "",
    `Dagens pris (${datumText(LP_DATUM)}), snitt av kedjornas listpriser inkl. moms:`,
    ...DRIVMEDEL.filter((d) => idagPris(d.nyckel) != null).map((d) => `- [${d.namn}](${SITE.url}${d.href}): ${t(idagPris(d.nyckel))} ${d.enhet}`),
    "", "Per kedja (bensin 95):", ...LISTKEDJOR.map((c) => `- ${c}: ${t(kedjePris(c, "bensin95") ?? 0)} kr/l`), "",
    `Genomsnittligt pumppris i Sverige veckan som började ${datumText(v.datum)} (EU-kommissionen): 95 ${t(v.b95)} kr/l, diesel ${t(v.diesel)} kr/l. Skatt utgör ${Math.round(s.andelSkatt * 100)} % av priset för 95.`, "",
    "## Priser och statistik",
    `- [Bensinpris idag](${SITE.url}/bensinpris/)`, `- [Dieselpris idag](${SITE.url}/dieselpris/)`,
    `- [Bensinprisets historik sedan 2005](${SITE.url}/historik/)`, `- [Bensinpriset ${AR}](${SITE.url}/historik/${AR}/)`,
    `- [Bensinpris i Europa](${SITE.url}/europa/)`, `- [Bränslekalkylator](${SITE.url}/rakna/)`, `- [Kedjor](${SITE.url}/kedja/)`, "",
    "## Guider", ...GUIDER.map((g) => `- [${g.namn}](${SITE.url}${g.href}): ${g.text}`), "",
    "## Län", ...KAT.lan.map((l) => `- [${l.namn}](${SITE.url}${l.href}): ${l.antal} ${ORD.plur}`), "",
    "## Största kommunerna", ...storst.map((k) => `- [${k.namn}](${SITE.url}${k.href}): ${k.enheter.length} ${ORD.plur}`), "",
    `- [Om, källor och öppna data](${SITE.url}/om/)`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
