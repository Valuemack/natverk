// Gemensamma uträkningar för de långa guidesidorna (/guider/). Allt räknas ur HaV:s öppna data i KAT,
// så siffrorna följer med när datan hämtas om. Fritext (beskrivning/sammanfattning) är kommunernas egen
// text på HaV:s Badplatsen – vi citerar bara det som står där, inga egna omdömen.
import { KAT } from "../site.js";

export const E = KAT.enheter;
export const LAN = KAT.lan;

/** Kommunens fritext om badplatsen, som en rad. */
export const text = (e) => [e.extra?.beskrivning, e.extra?.sammanfattning].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

/** Klassning ett visst år (null om saknas). */
export const klassAr = (e, ar) => [e.extra?.klassificering, ...(e.extra?.klassificeringar ?? [])].find((k) => k?.ar === ar)?.klass ?? null;
/** Senaste riktiga klassning (hoppar över "pågår" och "ej klassificerad"). */
export const senasteKlass = (e) => [e.extra?.klassificering, ...(e.extra?.klassificeringar ?? [])].find((k) => k && !/pågår|ej klass|ny badplats|otillräckligt/i.test(k.klass)) ?? null;
/** År som har en riktig klassning i datan, nyast först. */
export const KLASS_AR = [...new Set(E.flatMap((e) => (e.extra?.klassificeringar ?? []).filter((k) => !/pågår/i.test(k.klass)).map((k) => k.ar)))].sort((a, b) => b - a);

/** Alla prov för en badplats (med badplatsen bifogad). */
export const prov = (e) => (e.extra?.senaste_prov ?? []).map((p) => ({ ...p, e }));
export const ALLA_PROV = E.flatMap(prov);
export const PROV_AR = [...new Set(ALLA_PROV.map((p) => +p.datum.slice(0, 4)))].sort((a, b) => a - b);
export const SENASTE_AR = PROV_AR.at(-1);

/** Temperaturer 0 °C och lägre är nästan alltid felinmatningar i datan; vi räknar bara 1–32 °C. */
export const giltigTemp = (t) => typeof t === "number" && t >= 1 && t <= 32;

export const medel = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export const median = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const grad = (t, d = 1) => (t == null ? "–" : `${t.toFixed(d).replace(".", ",")} °C`);
export const pct = (a, b, d = 0) => (b ? `${((100 * a) / b).toFixed(d).replace(".", ",")} %` : "–");
export const tal = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const MANAD = { "05": "maj", "06": "juni", "07": "juli", "08": "augusti", "09": "september" };

/** Gruppera badplatser per län, i KAT:s länsordning. */
export const perLan = (lista) => LAN.map((l) => ({ lan: l, enheter: lista.filter((e) => e.lan === l.namn) })).filter((x) => x.enheter.length);

/** Badplatser vars kommuntext matchar ett mönster, med ett kort utdrag runt träffen. */
export function hitta(re, lista = E) {
  return lista.filter((e) => re.test(text(e))).map((e) => {
    const t = text(e);
    const i = t.search(re);
    // Utdrag: meningen som innehåller träffen.
    const start = Math.max(0, t.lastIndexOf(". ", i) + 1);
    const slut = t.indexOf(".", i);
    return { e, utdrag: t.slice(start, slut === -1 ? undefined : slut + 1).trim() };
  });
}

export const vattenTyp = (e) => e.extra?.vattentyp === "Hav" ? "havsbad" : e.extra?.vattentyp === "Sjö" ? "sjöbad" : e.typ;
