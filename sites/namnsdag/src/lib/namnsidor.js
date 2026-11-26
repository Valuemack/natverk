// Gemensamt för namnsidorna och deras kalenderfiler: vilka sidor som finns.
import { ALLA_NAMN, VARIANTER, nastaDatum, datum, delMmdd, IDAG, iso } from "../site.js";

export const NAMNSIDOR = [
  ...ALLA_NAMN.map((n) => ({ slug: n.slug, typ: "namn", n })),
  ...VARIANTER.map((v) => ({ slug: v.slug, typ: "variant", v, n: v.huvud })),
];

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
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//namnsdagsidag.se//Namnsdag//SV", "CALSCALE:GREGORIAN",
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
