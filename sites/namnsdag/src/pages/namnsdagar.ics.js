// /namnsdagar.ics – hela namnlängden som årligen återkommande heldagshändelser (en per dag).
import { SITE, IDAG, DAGAR, namnPaDag, kommandeNamnPaDag, delMmdd, dagHref, iso, AR } from "../site.js";

export function GET() {
  const d = (dt) => iso(dt).replaceAll("-", "");
  const rader = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//dagensnamnsdagar.se//Namnsdagar//SV", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Namnsdagar", "X-WR-TIMEZONE:Europe/Stockholm"];
  for (const k of DAGAR) {
    const { m, d: dd } = delMmdd(k);
    const delar = [[namnPaDag(k), AR], ...(kommandeNamnPaDag(k).length ? [[[...namnPaDag(k), ...kommandeNamnPaDag(k)], kommandeNamnPaDag(k)[0].fran]] : [])];
    delar.forEach(([namn, fran], i) => {
      if (!namn.length) return;
      // Skottdagen återkommer bara vart fjärde år.
      let ar = fran;
      while (new Date(Date.UTC(ar, m - 1, dd)).getUTCMonth() !== m - 1) ar++;
      const start = new Date(Date.UTC(ar, m - 1, dd));
      const slut = new Date(start.getTime() + 86400000);
      const tillAr = delar[1] && i === 0 ? delar[1][1] - 1 : null;
      const regel = k === "02-29" ? "RRULE:FREQ=YEARLY;INTERVAL=4" : "RRULE:FREQ=YEARLY";
      rader.push("BEGIN:VEVENT", `UID:namnsdag-${k}${i ? `-${fran}` : ""}@namnsdagsidag.se`, `DTSTAMP:${d(IDAG)}T000000Z`,
        `DTSTART;VALUE=DATE:${d(start)}`, `DTEND;VALUE=DATE:${d(slut)}`,
        tillAr ? `${regel};UNTIL=${tillAr}1231` : regel,
        `SUMMARY:Namnsdag: ${namn.map((n) => n.namn).join(", ")}`, `URL:${SITE.url}${dagHref(k)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    });
  }
  rader.push("END:VCALENDAR");
  // RFC 5545: rader längre än 75 oktetter ska vikas.
  const vik = (r) => { const ut = []; let s = r; while (Buffer.byteLength(s) > 74) { let i = 74; while (Buffer.byteLength(s.slice(0, i)) > 74) i--; ut.push(s.slice(0, i)); s = " " + s.slice(i); } ut.push(s); return ut.join("\r\n"); };
  return new Response(rader.map(vik).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}
