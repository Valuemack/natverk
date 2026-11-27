// Gemensamt för namnsidorna och deras kalenderfiler: vilka sidor som finns.
import { ALLA_NAMN, SAMMANSLAGNA, VARIANTER, UTAN_VARIANT, nastaDatum, datum, delMmdd, IDAG, iso } from "../site.js";

export const NAMNSIDOR = [
  ...ALLA_NAMN.filter((n) => !SAMMANSLAGNA.has(n.namn)).map((n) => ({ slug: n.slug, typ: "namn", n })),
  ...VARIANTER.map((v) => ({ slug: v.slug, typ: "variant", v, n: v.huvud })),
  // Namn utan namnsdag och utan almanacksform: gemensam namnsdag 1 januari.
  ...UTAN_VARIANT.map((v) => ({ slug: v.slug, typ: "utan", v, n: { namn: v.namn, datum: "01-01" } })),
];
/** Visningsnamnet för en namnsida. */
export const sidNamn = (s) => (s.typ === "namn" ? s.n.namn : s.v.namn);

/** Första datum händelsen ska gälla från (nästa förekomst, eller det år namnet tillkommer). */
export function startDatum(n) {
  if (n.fran && n.fran > IDAG.getUTCFullYear()) { const { m, d } = delMmdd(n.datum); return datum(n.fran, m, d); }
  return nastaDatum(n.datum);
}

/** iCalendar-fil (RFC 5545) med en årligen återkommande heldagshändelse. */
export function ics(namn, n, url) {
  const start = startDatum(n);
  const d = (dt) => iso(dt).replaceAll("-", "");
  const rader = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//namnsdagaridag.se//Namnsdag//SV", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:namnsdag-${encodeURIComponent(namn.toLowerCase())}@namnsdagsidag.se`,
    `DTSTAMP:${d(IDAG)}T000000Z`,
    `DTSTART;VALUE=DATE:${d(start)}`,
    `DTEND;VALUE=DATE:${d(new Date(start.getTime() + 86400000))}`,
    "RRULE:FREQ=YEARLY",
    `SUMMARY:${namn} har namnsdag`,
    `URL:${url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return rader.join("\r\n") + "\r\n";
}
