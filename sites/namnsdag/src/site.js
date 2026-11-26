// Namnsdagssajten: data, slugs och hjälpfunktioner för alla sidor.
import { idagStockholm, iso, datum, plusDagar, veckodag, MANADER, VECKODAGAR, dagarMellan } from "@natverk/core/datum.js";
// Datan importeras som JSON så att Vite buntar in den (filerna kan bytas ut utan kodändringar).
import NL from "../data/namnlangd.json";
import SCB from "../data/scb.json";

export const IDAG = idagStockholm();
export const AR = IDAG.getUTCFullYear();
export const UPPDATERAD = iso(IDAG);
export { MANADER, VECKODAGAR };

export const SITE = {
  tema: "namnsdag",
  tagline: "Vem har namnsdag idag?",
  tjanstText: "Oberoende namnsdagskalender · Namnlängden enligt Isof · Namnstatistik från SCB",
  kallor: ["Institutet för språk och folkminnen (namnlängden)", "SCB:s statistikdatabas (namnstatistik, CC0)"],
  namn: "Namnsdag idag",
  visningsnamn: "namnsdagsidag.se",
  url: "https://namnsdagsidag.se",
  beskrivning: "Vem har namnsdag idag? Alla namnsdagar i den svenska almanackan dag för dag, när varje namn har namnsdag och hur många som bär namnet enligt SCB.",
  organisation: "namnsdagsidag.se",
  farg: "#7a2e5a",
  meny: [
    { namn: "Idag", href: "/" },
    { namn: "Alla namn A–Ö", href: "/alla-namn/" },
    { namn: "Månader", href: "/januari/" },
    { namn: "Nya namn", href: "/nya-namn/" },
    { namn: "Namn utan namnsdag", href: "/namn-utan-namnsdag/" },
    { namn: "Om namnsdagar", href: "/namnsdag/" },
  ],
  sidfot: [
    { namn: "Om namnsdagsidag.se", href: "/om/" },
    { namn: "Källor och metod", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Namnlängden fastställs av Namnlängdskommittén och publiceras av Institutet för språk och folkminnen. Antal bärare kommer från SCB. Sajten är en oberoende tjänst och inte knuten till Svenska Akademien, Isof eller SCB.",
  natverk: [],
};

// ---------- Slugs ----------
const TRANSLIT = { å: "a", ä: "a", ö: "o", é: "e", è: "e", ü: "u", æ: "a", ø: "o" };
export const slug = (s) => s.toLowerCase().replace(/[åäöéèüæø]/g, (c) => TRANSLIT[c]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const pad = (n) => String(n).padStart(2, "0");
/** "03-01" → { m: 3, d: 1 } */
export const delMmdd = (k) => { const [m, d] = k.split("-").map(Number); return { m, d }; };
export const mmddAv = (dt) => `${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
/** "3 januari" */
export const dagText = (k) => { const { m, d } = delMmdd(k); return `${d} ${MANADER[m - 1]}`; };
/** URL för en dag: /3-januari/ */
export const dagHref = (k) => { const { m, d } = delMmdd(k); return `/${d}-${MANADER[m - 1]}/`; };
export const manadHref = (m) => `/${MANADER[m - 1]}/`;
export const namnHref = (n) => `/namn/${SLUG_AV.get(n) ?? slug(n)}/`;

// ---------- Namnlängden ----------
/** Alla namn, även de som tillkommer senare (fran = första året). */
// Marta/Märta och Marit/Märit skulle få samma slug – namnet med prickar får då ae/oe/aa (/namn/maerta/).
const LANG_TRANSLIT = { å: "aa", ä: "ae", ö: "oe" };
const enkla = new Set(NL.namn.filter((n) => slug(n.namn) === n.namn.toLowerCase()).map((n) => slug(n.namn)));
const unikSlug = (namn) => {
  const s = slug(namn);
  return s !== namn.toLowerCase() && enkla.has(s) ? slug(namn.toLowerCase().replace(/[åäö]/g, (c) => LANG_TRANSLIT[c])) : s;
};
export const ALLA_NAMN = NL.namn.map((n) => ({ ...n, slug: unikSlug(n.namn), scb: SCB.namn[n.namn] ?? null }));
const SLUG_AV = new Map(ALLA_NAMN.map((n) => [n.namn, n.slug]));
export const NAMN_KALLA = NL.kalla;
export const ANDRINGAR = NL.andringar;
export const UTAN_NAMN = NL.utanNamn;

/** Gäller namnet ett visst år? */
export const giltigt = (n, ar = AR) => !n.fran || ar >= n.fran;

/** Alla 366 dagar (mm-dd) i kalenderordning. */
export const DAGAR = Array.from({ length: 366 }, (_, i) => mmddAv(plusDagar(datum(2024, 1, 1), i)));

/** Namn på en dag ett visst år (bara de som gäller det året). */
export const namnPaDag = (k, ar = AR) => ALLA_NAMN.filter((n) => n.datum === k && giltigt(n, ar));
/** Namn som tillkommer på dagen efter det aktuella året. */
export const kommandeNamnPaDag = (k, ar = AR) => ALLA_NAMN.filter((n) => n.datum === k && !giltigt(n, ar));

/** "Alfred och Alfrida", "Kasper, Melker och Baltsar" */
export const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} och ${xs.at(-1)}`);

/** Nästa förekomst av mm-dd från ett datum (idag räknas). Skottdagen hoppar till nästa skottår. */
export function nastaDatum(k, fran = IDAG) {
  const { m, d } = delMmdd(k);
  for (let ar = fran.getUTCFullYear(); ar < fran.getUTCFullYear() + 9; ar++) {
    const dt = datum(ar, m, d);
    if (dt.getUTCMonth() !== m - 1) continue; // 29 feb finns inte detta år
    if (dt >= fran) return dt;
  }
  return null;
}

/** Veckodag för dagen under kommande år: [{ ar, dag }] */
export function kommandeAr(k, antal = 6) {
  const { m, d } = delMmdd(k);
  const ut = [];
  for (let ar = AR; ut.length < antal && ar < AR + 30; ar++) {
    const dt = datum(ar, m, d);
    if (dt.getUTCMonth() !== m - 1) continue;
    ut.push({ ar, dag: veckodag(dt), dt });
  }
  return ut;
}

export const fore = (k) => DAGAR[(DAGAR.indexOf(k) + 365) % 366];
export const efter = (k) => DAGAR[(DAGAR.indexOf(k) + 1) % 366];

// ---------- Allmänna flaggdagar och helgdagar som infaller på fast datum ----------
// Förordning (1982:270) om allmänna flaggdagar och lag (1989:253) om allmänna helgdagar.
export const FASTA_DAGAR = {
  "01-01": "nyårsdagen (röd dag och allmän flaggdag)",
  "01-06": "trettondedag jul (röd dag)",
  "01-28": "kungens namnsdag (allmän flaggdag)",
  "03-12": "kronprinsessans namnsdag (allmän flaggdag)",
  "04-30": "kungens födelsedag (allmän flaggdag) och valborgsmässoafton",
  "05-01": "första maj (röd dag och allmän flaggdag)",
  "06-06": "Sveriges nationaldag (röd dag och allmän flaggdag)",
  "07-14": "kronprinsessans födelsedag (allmän flaggdag)",
  "08-08": "drottningens namnsdag (allmän flaggdag)",
  "10-24": "FN-dagen (allmän flaggdag)",
  "11-06": "Gustav Adolfsdagen (allmän flaggdag)",
  "12-10": "Nobeldagen (allmän flaggdag)",
  "12-23": "drottningens födelsedag (allmän flaggdag)",
  "12-24": "julafton",
  "12-25": "juldagen (röd dag och allmän flaggdag)",
  "12-26": "annandag jul (röd dag)",
  "12-31": "nyårsafton",
};

// ---------- SCB ----------
export const SCB_KALLA = SCB.kalla;
export const SCB_TOTALT = { namn: SCB.antalTilltalsnamn2020, personer: SCB.personerMedTilltalsnamn2020 };
export const UTAN_NAMNSDAG = SCB.vanligasteUtanNamnsdag;
const summa = (x) => (x ? (x.K ?? 0) + (x.M ?? 0) : 0);
/** Antal med namnet som tilltalsnamn 2020 (kvinnor + män). */
export const barare = (n) => summa(n.scb?.tilltal2020);
export const tal = (x) => Number(x).toLocaleString("sv-SE");
export const st = (x, en, fler) => `${tal(x)} ${x === 1 ? en : fler}`;

/** Kort mening om antal bärare, eller null. */
export function bararText(n) {
  const b = barare(n);
  if (!b) return null;
  return `${tal(b)} personer i Sverige har ${n.namn} som tilltalsnamn (SCB 2020)`;
}

// ---------- Stavningsvarianter ----------
// Vanliga namn som saknas i almanackan men bara skiljer sig i stavning från ett almanacksnamn
// (Thomas/Tomas, Carl/Karl, Sarah/Sara). Språkligt samhöriga namn firas på almanacksnamnets dag
// (jfr Isofs utökade namnlista). Bara namn med minst 1 000 bärare får egen sida.
const norm = (s) => s.toLowerCase().replace(/chr/g, "kr").replace(/th/g, "t").replace(/ph/g, "f")
  .replace(/ck/g, "k").replace(/c(?![eiy])/g, "k").replace(/h$/, "").replace(/w/g, "v");
const ALM_NORM = new Map();
for (const n of ALLA_NAMN) if (!ALM_NORM.has(norm(n.namn))) ALM_NORM.set(norm(n.namn), n);
const ALM_SLUGS = new Set(ALLA_NAMN.map((n) => n.slug));
export const VARIANTER = UTAN_NAMNSDAG
  .map((x) => ({ ...x, slug: slug(x.namn), huvud: ALM_NORM.get(norm(x.namn)) }))
  .filter((x) => x.huvud && x.huvud.namn !== x.namn && x.antal >= 1000 && !ALM_SLUGS.has(x.slug));
/** Variant för ett almanacksnamn: [{ namn, antal }] */
export const varianterTill = (n) => VARIANTER.filter((v) => v.huvud.namn === n.namn);

export { iso, datum, plusDagar, veckodag, dagarMellan };
