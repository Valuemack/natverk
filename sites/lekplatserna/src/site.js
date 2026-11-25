import { idagStockholm, iso } from "@natverk/core/datum.js";
import { byggKatalog } from "@natverk/core/katalog.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"lekplats","plur":"lekplatser","art":"en"};
export const SCHEMA_TYP = "Playground";
export const TITEL_ORD = "utrustning";
export const KALLA = "Källor: kommunernas öppna data och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).";

/** Utrustning med svensk visningsform, i den ordning den visas. */
export const UTRUSTNING = {
  linbana: "Linbana", vattenlek: "Vattenlek", studsmatta: "Studsmatta", hoppkudde: "Hoppkudde", klättervägg: "Klättervägg",
  hinderbana: "Hinderbana", motorikbana: "Motorikbana", parkour: "Parkour", skatepark: "Skatepark", repbana: "Repbana",
  kompisgunga: "Kompisgunga", gungor: "Gungor", fjädergunga: "Fjädergunga", snurrgunga: "Snurrgunga", gungbräda: "Gungbräda",
  karusell: "Karusell", rutschkana: "Rutschkana", klätterställning: "Klätterställning", lekställning: "Lekställning",
  lekskepp: "Lekskepp", lekhus: "Lekhus", sandlåda: "Sandlåda", lekbord: "Lekbord", balansbana: "Balansbana", tunnel: "Tunnel",
  hängbro: "Hängbro", trafiklekplats: "Trafiklekplats", bollplan: "Bollplan", basketkorg: "Basketkorg", multisportarena: "Multisportarena",
  pingisbord: "Pingisbord", boulebana: "Boulebana", utegym: "Utegym", räck: "Räck", fartlek: "Fartlek", pulkabacke: "Pulkabacke",
  grillplats: "Grillplats", sittplatser: "Sittplatser", lekslinga: "Lekslinga", tonårsplats: "Plats för tonåringar",
};
export const utrustning = (e) => (e.extra?.utrustning ?? []).filter((u) => UTRUSTNING[u]).sort((a, b) => Object.keys(UTRUSTNING).indexOf(a) - Object.keys(UTRUSTNING).indexOf(b));
// OpenStreetMap anger underlag på engelska ("fine_gravel", "sand;grass"). Kommunernas svenska text behålls.
const YTA = {
  sand: "sand", grass: "gräs", tartan: "tartan", asphalt: "asfalt", woodchips: "flis", gravel: "grus", fine_gravel: "stenmjöl",
  rubbercrumb: "gummigranulat", rubber: "gummi", paved: "hårdgjort", plastic: "plast", artificial_turf: "konstgräs", ground: "naturmark",
  unpaved: "grus", bark: "bark", dirt: "jord", compacted: "packat grus", concrete: "betong", wood: "trä", grass_paver: "gräsarmering",
  paving_stones: "plattor", stone: "sten", cobblestone: "gatsten", mixed: "blandat", water: "vatten", rock: "berg",
};
export function underlag(v) {
  if (!v) return null;
  const s = String(v);
  if (/[åäö]|\s/i.test(s) && !/^[a-z_;,/ ]+$/i.test(s)) return s.replace(/\.$/, "");
  const delar = [...new Set(s.toLowerCase().split(/[;,/]|_(?=sand|gravel)/).map((d) => YTA[d.trim().replace(/^_/, "")]).filter(Boolean))];
  return delar.length ? delar.join(", ").replace(/^./, (c) => c.toUpperCase()) : null;
}
export const TYPNAMN ={ lekplats: "Lekplats", temalekplats: "Temalekplats", naturlekplats: "Naturlekplats" };

// En lekplats får egen sida bara när det finns något att berätta: namn eller tema och
// minst tre redskap, en beskrivning eller ett tema. Övriga listas på kommunsidan.
const harEgenSida = (e) => {
  const x = e.extra ?? {};
  const kand = x.namngiven !== false || e.typ !== "lekplats" || !!x.officiell_kalla;
  return kand && (utrustning(e).length >= 3 || !!x.beskrivning || !!x.tema || e.typ !== "lekplats");
};

const fil = resolve(process.cwd(), process.env.DATAFIL ?? "../parkering-lek/data/lekplatser.json");
const RAA = existsSync(fil) ? JSON.parse(readFileSync(fil, "utf8")) : [];
export const KAT = byggKatalog(RAA.filter((e) => e.kommun).map((e) => {
  const x = e.extra ?? {};
  const u = utrustning(e);
  // Poster utan namn (en del fick felaktigt sluggen "parkering-…" i källan) får namn efter orten.
  const namn = e.namn ?? `${TYPNAMN[e.typ] ?? "Lekplats"} i ${e.ort ?? e.kommun}`;
  const slug = e.namn ? e.slug : `lekplats-${e.id.replace(/\D/g, "")}`;
  return {
    ...e,
    namn, slug,
    typ: TYPNAMN[e.typ]?.toLowerCase() ?? "lekplats",
    listaRad: [x.tema && `Tema: ${x.tema}`, u.slice(0, 4).map((v) => UTRUSTNING[v].toLowerCase()).join(", "), x.tillganglighet === "tillgänglighetsanpassad" && "tillgänglig"].filter(Boolean).join(" · "),
  };
}), { harEgenSida });

export const SITE = {
  tema: "natur",
  tagline: "Lekplatser i hela Sverige",
  tjanstText: "Oberoende lekplatsguide · Uppgifter från kommuner och OpenStreetMap",
  kallor: ["Kommunernas öppna data","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Lekplatserna",
  visningsnamn: "lekplatserna.nu",
  url: "https://lekplatserna.nu",
  beskrivning: "Lekplatser i alla Sveriges kommuner – temalekplatser, naturlekplatser och lekplatser med linbana, vattenlek och kompisgunga. Uppdateras varje natt.",
  organisation: "lekplatserna.nu",
  farg: "#2f6b2f",
  meny: [{"namn":"Temalekplatser","href":"/temalekplatser/"},{"namn":"Guider","href":"/guider/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om lekplatserna.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: kommunernas öppna data och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).",
  natverk: [],
};

// Parkeringar nära lekplatsen (samma OSM- och kommununderlag som parkeringar.nu). Bara läge och avgift behövs.
const PFIL = resolve(process.cwd(), "../parkering-lek/data/parkeringar.json");
export const PARKERINGAR = existsSync(PFIL)
  ? JSON.parse(readFileSync(PFIL, "utf8")).filter((p) => p.lat != null).map((p) => ({
      namn: p.namn, typ: p.typ, lat: p.lat, lon: p.lon,
      gratis: p.extra?.avgift === false || p.extra?.taxa_per_timme === 0,
      timpris: p.extra?.taxa_per_timme > 0 ? p.extra.taxa_per_timme : null,
      platser: p.extra?.kapacitet ?? null,
    }))
  : [];
