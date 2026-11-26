import { SITE, IDAG, UPPDATERAD, mmddAv, namnPaDag, dagText, plusDagar, lista, UTAN_NAMN, MANADER, ANDRINGAR, NAMN_KALLA, SCB_KALLA } from "../site.js";

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
    `Uppdaterad: ${UPPDATERAD}. Oberoende tjänst, inte knuten till Svenska Akademien, Isof eller SCB.`,
    "",
    "## Namnsdagar de närmaste sju dagarna",
    ...Array.from({ length: 7 }, (_, i) => dag(plusDagar(IDAG, i))),
    "",
    "## Viktiga sidor",
    `- [Namnsdag idag](${SITE.url}/)`,
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
    `- Ett namn: ${SITE.url}/namn/{namn}/ (t.ex. /namn/ture/) – datum, antal bärare (SCB), nyfödda per år`,
    `- En dag: ${SITE.url}/{dag}-{månad}/ (t.ex. /3-januari/)`,
    `- Kalenderfil: ${SITE.url}/namn/{namn}/kalender.ics, alla namnsdagar: ${SITE.url}/namnsdagar.ics`,
    "",
    "## Fakta",
    "- Den 1 januari är gemensam namnsdag för alla namn som saknas i almanackan.",
    `- Från 2027 tillkommer ${nya.length} namn: ${lista(nya.map((a) => a.nytt))}.`,
    "",
    "## Källor",
    `- Namnlängden: ${NAMN_KALLA.utgivare}, ${NAMN_KALLA.url}`,
    `- Namnstatistik: ${SCB_KALLA}`,
  ];
  return new Response(rader.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
