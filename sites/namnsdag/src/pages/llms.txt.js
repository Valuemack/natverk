import { SITE, IDAG, UPPDATERAD, mmddAv, namnPaDag, dagText, plusDagar, lista, UTAN_NAMN, MANADER, ANDRINGAR, NAMN_KALLA, SCB_KALLA, ANTAL_NU, ANTAL_SEN, NYA_AR, AR, UTAN_NAMNSDAG, MIN_BARARE, KALENDER_AR } from "../site.js";

export function GET() {
  const dag = (dt) => {
    const k = mmddAv(dt);
    const n = namnPaDag(k, dt.getUTCFullYear());
    return `- ${dagText(k)}: ${n.length ? lista(n.map((x) => x.namn)) : `ingen namnsdag (${UTAN_NAMN[k]?.split(" –")[0]})`}`;
  };
  const nya = ANDRINGAR.filter((a) => a.ar === 2027 && a.nytt);
  const rader = [
    `# ${SITE.visningsnamn}`,
    "",
    `> ${SITE.beskrivning}`,
    "",
    `Uppdaterad: ${UPPDATERAD}. Oberoende tjänst, inte knuten till Svenska Akademien, Isof eller SCB. Drivs av samma ägare som Posta Brev (postabrev.se), som namn- och datumsidorna länkar till för gratulationsbrev.`,
    "",
    "## Namnsdagar de närmaste sju dagarna",
    ...Array.from({ length: 7 }, (_, i) => dag(plusDagar(IDAG, i))),
    "",
    "## Viktiga sidor",
    `- [Namnsdag idag](${SITE.url}/)`,
    `- [Namnsdagar ${KALENDER_AR} – kalender att skriva ut](${SITE.url}/namnsdagar-${KALENDER_AR}/)`,
    `- [Hitta barnnamn (filter på SCB-data)](${SITE.url}/hitta-barnnamn/)`,
    `- [Namnstatistik för press](${SITE.url}/press/)`,
    `- [Gratis namnsdagswidget](${SITE.url}/widget/)`,
    `- [Alla namn A–Ö](${SITE.url}/alla-namn/)`,
    ...MANADER.map((m) => `- [Namnsdagar i ${m}](${SITE.url}/${m}/)`),
    `- [Nya namn i almanackan 2027](${SITE.url}/nya-namn/)`,
    `- [Vanligaste namnen i Sverige](${SITE.url}/vanligaste-namnen/)`,
    `- [Vanligaste namnen utan namnsdag](${SITE.url}/namn-utan-namnsdag/)`,
    `- [Namnsdag – historia och almanackan](${SITE.url}/namnsdag/)`,
    `- [Hur många heter …? (sök i SCB:s namnstatistik)](${SITE.url}/hur-manga-heter/)`,
    `- [Pojknamn – populära och klassiska](${SITE.url}/pojknamn/)`,
    `- [Flicknamn – populära och klassiska](${SITE.url}/flicknamn/)`,
    `- [Grattis på namnsdagen – hälsningar och tradition](${SITE.url}/grattis-pa-namnsdagen/)`,
    `- [Ovanliga namn och namnens betydelse](${SITE.url}/ovanliga-namn/)`,
    `- [Källor och metod](${SITE.url}/om/)`,
    "",
    "## URL-mönster",
    `- Ett namn: ${SITE.url}/namn/{namn}/ (t.ex. /namn/ture/) – namnsdag, betydelse (Wikipedia), antal bärare, kön och medelålder (SCB 2020), nyfödda 1998–2022, kända personer (Wikidata)`,
    `- Namn utan namnsdag: samma mönster, t.ex. /namn/liam/ (gemensam namnsdag 1 januari)`,
    `- En dag: ${SITE.url}/{dag}-{månad}/ (t.ex. /3-januari/) – namnsdag, röd dag/flaggdag, FN-dagar, födda, vecka och nedräkning till jul`,
    `- Kalenderfil: ${SITE.url}/namn/{namn}/kalender.ics, alla namnsdagar: ${SITE.url}/namnsdagar.ics`,
    `- Data: ${SITE.url}/data/namnsdagar.json (alla namnsdagar), ${SITE.url}/data/barnnamn.json (nyfödda 2018–2022 per namn)`,
    `- Sök: ${SITE.url}/?namn={namn} går direkt till namnsidan`,
    "",
    "## Fakta",
    `- Almanackan har ${ANTAL_NU} namn ${AR} och ${ANTAL_SEN} från ${NYA_AR}.`,
    "- Den 1 januari är gemensam namnsdag för alla namn som saknas i almanackan.",
    `- ${UTAN_NAMNSDAG.length} tilltalsnamn med minst ${MIN_BARARE} bärare saknas i almanackan (SCB 2020).`,
    "- SCB:s senaste namnstatistik: tilltalsnamn 31 december 2020, nyfödda 2022 (SCB slutade publicera namnstatistik 2024).",
    `- Från 2027 tillkommer ${nya.length} namn: ${lista(nya.map((a) => a.nytt))}.`,
    "",
    "## Källor",
    `- Namnlängden: ${NAMN_KALLA.utgivare}, ${NAMN_KALLA.url}`,
    `- Namnstatistik: ${SCB_KALLA}`,
    "- Namnens betydelse: svenska Wikipedia (CC BY-SA 4.0), citerat ordagrant med källa",
    "- Kända personer: Wikidata (CC0); födda per dag: svenska Wikipedia (CC BY-SA 4.0)",
    "- FN-dagar: un.org/en/observances/list-days-weeks",
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
