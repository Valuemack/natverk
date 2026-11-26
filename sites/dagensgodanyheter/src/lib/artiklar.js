// Läser artiklarna (data/artiklar/*.json) vid byggtid och räknar fram läsvärdet som startsidan sorteras efter.
import { KAT, KAT_SLUGS } from "./kategorier.js";
import { AMNESHUBBAR, hubbFor } from "./amnen.js";

const filer = import.meta.glob("../../data/artiklar/*.json", { eager: true, import: "default" });

/** Byggtidpunkten. BYGGTID=2026-11-25T06:00:00Z kan sättas för test. */
export const NU = process.env.BYGGTID ? new Date(process.env.BYGGTID) : new Date();

const farskhet = (iso) => Math.pow(0.5, Math.max(0, (NU - new Date(iso)) / 3.6e6) / 36); // halveringstid 36 h

/**
 * Läsvärde 0–100: källans och nyhetens egna poäng (positiv, betydelse, tillit) vägs ihop med hur färsk artikeln är nu.
 * Samma vikter som i scripts/lib/poang.mjs, så att ordningen på startsidan följer poängsättningen.
 */
export function lasvarde(a) {
  const p = a.poang ?? {};
  return Math.round(100 * (0.35 * (p.positiv ?? 0.6) + 0.25 * (p.betydelse ?? 0.5) + 0.2 * farskhet(a.publicerad) + 0.2 * (p.tillit ?? 0.85)));
}

export const ordAv = (a) => [a.ingress, ...a.avsnitt.flatMap((s) => [s.rubrik, ...s.stycken]), a.varfor].join(" ").split(/\s+/).filter(Boolean).length;

export const ARTIKLAR = Object.values(filer)
  .filter((a) => a && a.slug && KAT_SLUGS.includes(a.kategori) && a.kalla?.url && new Date(a.publicerad) <= NU)
  .map((a) => ({
    ...a,
    href: `/${a.kategori}/${a.slug}/`,
    kat: KAT[a.kategori],
    lasvarde: lasvarde(a),
    ord: ordAv(a),
    lasminuter: Math.max(1, Math.round(ordAv(a) / 200)),
    // Bara riktiga bilder (fria foton eller redaktionens illustrationer). De flesta artiklar är ren text, som i en
    // tidning; delningsbilden blir då avdelningens typografiska kort och schemats bild sajtens logga.
    harBild: Boolean(a.bild?.fil),
    bildUrl: a.bild?.fil ?? null,
    bildLiten: a.bild?.liten ?? a.bild?.fil ?? null,
    ogBild: a.bild?.og ?? `/delning/${a.kategori}.jpg`,
  }))
  .sort((a, b) => new Date(b.publicerad) - new Date(a.publicerad));

export const efterLasvarde = (lista) => [...lista].sort((a, b) => b.lasvarde - a.lasvarde || new Date(b.publicerad) - new Date(a.publicerad));
export const iKategori = (slug) => ARTIKLAR.filter((a) => a.kategori === slug);
export const senaste = (timmar) => ARTIKLAR.filter((a) => NU - new Date(a.publicerad) <= timmar * 3.6e6);

/** Ämnen (taggar) med minst tre artiklar får en egen hubbsida; färre vore en tunn sida. */
export const MIN_AMNE = 3;
export const amnesSlug = (t) => t.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Hubbslug för ett ämnesord: den fasta hubben om ordet hör till en, annars ordets egen slug. */
export const hubbSlug = (t) => hubbFor(t)?.slug ?? amnesSlug(t);
export const AMNEN = (() => {
  const m = new Map();
  for (const a of ARTIKLAR) {
    for (const t of new Set((a.taggar ?? []).map(hubbSlug))) {
      if (!m.has(t)) {
        const fast = AMNESHUBBAR.find((h) => h.slug === t);
        m.set(t, { slug: t, namn: fast?.namn ?? (a.taggar.find((x) => hubbSlug(x) === t)), fast: Boolean(fast), artiklar: [] });
      }
      m.get(t).artiklar.push(a);
    }
  }
  return [...m.values()].filter((x) => x.artiklar.length >= MIN_AMNE).sort((a, b) => b.fast - a.fast || b.artiklar.length - a.artiklar.length);
})();
export const AMNE_SLUGAR = new Set(AMNEN.map((x) => x.slug));
/** Artikelns ämneshubbar (bara de som har en sida). */
export const hubbarFor = (a) => AMNEN.filter((x) => (a.taggar ?? []).some((t) => hubbSlug(t) === x.slug));
/** Sidtitel högst ~70 tecken: sökrubriken (eller rubriken) med sajtnamnet om det får plats. */
export function sidtitel(a) {
  const r = a.seorubrik || a.rubrik;
  const med = `${r} | Dagens goda nyheter`;
  return med.length <= 70 ? med : r;
}

/** Relaterade: samma ämnen först, sedan samma kategori. */
export function relaterade(a, n = 3) {
  const taggar = new Set(a.taggar ?? []);
  return ARTIKLAR.filter((b) => b.slug !== a.slug)
    .map((b) => ({ b, v: (b.taggar ?? []).filter((t) => taggar.has(t)).length * 3 + (b.kategori === a.kategori ? 2 : 0) + farskhet(b.publicerad) }))
    .sort((x, y) => y.v - x.v).slice(0, n).map((x) => x.b);
}

// ---------- datum ----------
const TZ = "Europe/Stockholm";
export const datumText = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
export const tidText = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const datumTid = (iso) => `${datumText(iso)} kl. ${tidText(iso)}`;
export const dagText = (d = NU) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
export const isoDag = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(d));
export function relativ(iso) {
  const min = Math.round((NU - new Date(iso)) / 6e4);
  if (min < 60) return `${Math.max(1, min)} min sedan`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} tim sedan`;
  return datumText(iso);
}
export const versal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Klockslag i tidningsform: 03.00. */
export const klockslag = (iso) => tidText(iso).replace(":", ".");

/** Första numret kom ut 25 november 2026. Numret räknas i dagar därifrån (svensk tid). */
const FORSTA_NUMRET = "2026-11-25";
export const nummer = (d = NU) => Math.max(1, Math.round((Date.parse(isoDag(d)) - Date.parse(FORSTA_NUMRET)) / 864e5) + 1);
export const argang = (d = NU) => Number(isoDag(d).slice(0, 4)) - 2026 + 1;
/** Senaste publicering – visas som "Uppdaterad" i tidningshuvudet. */
export const SENAST_UPPDATERAD = ARTIKLAR.length ? ARTIKLAR.map((a) => a.uppdaterad ?? a.publicerad).sort().at(-1) : null;
