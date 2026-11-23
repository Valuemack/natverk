// Svenska helgdagar enligt lag (1989:253) om allmänna helgdagar, helgaftnar som
// jämställs med söndag i semesterlagen (1977:480) 3 a §, och allmänna flaggdagar
// enligt förordning (1982:270). Allt beräknas – ingen extern data behövs.
import { datum, plusDagar, iso, arHelg, dagarMellan } from "@natverk/core/datum.js";

/** Påskdagen (gregoriansk kalender, anonym algoritm / Meeus). */
export function paskdagen(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const manad = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return datum(y, manad, dag);
}

/** Första dagen med given veckodag (0=sön … 6=lör) inom [från, från+6]. */
const forstaVeckodag = (fran, vd) => plusDagar(fran, (vd - fran.getUTCDay() + 7) % 7);

// typ: "rod" = allmän helgdag (röd dag), "afton" = helgafton som jämställs med söndag
export const HELGDAGAR = [
  { id: "nyarsdagen", namn: "Nyårsdagen", kort: "Nyårsdagen", slug: "nyarsdagen", typ: "rod",
    regel: "Nyårsdagen infaller alltid den 1 januari.", berakna: (y) => datum(y, 1, 1) },
  { id: "trettondedag-jul", namn: "Trettondedag jul", kort: "Trettondedag jul", slug: "trettondedag-jul", typ: "rod",
    regel: "Trettondedag jul infaller alltid den 6 januari, tretton dagar efter julafton.", berakna: (y) => datum(y, 1, 6) },
  { id: "langfredagen", namn: "Långfredagen", kort: "Långfredagen", slug: "langfredagen", typ: "rod",
    regel: "Långfredagen är fredagen före påskdagen.", berakna: (y) => plusDagar(paskdagen(y), -2) },
  { id: "paskafton", namn: "Påskafton", kort: "Påskafton", slug: "paskafton", typ: "afton",
    regel: "Påskafton är lördagen före påskdagen. Den är ingen allmän helgdag enligt lag, men infaller alltid på en lördag.",
    berakna: (y) => plusDagar(paskdagen(y), -1) },
  { id: "paskdagen", namn: "Påskdagen", kort: "Påsk", slug: "pask", typ: "rod",
    regel: "Påskdagen är den första söndagen efter den första fullmånen på eller efter vårdagjämningen (räknad som 21 mars). Den kan därför infalla mellan 22 mars och 25 april.",
    berakna: paskdagen },
  { id: "annandag-pask", namn: "Annandag påsk", kort: "Annandag påsk", slug: "annandag-pask", typ: "rod",
    regel: "Annandag påsk är måndagen efter påskdagen.", berakna: (y) => plusDagar(paskdagen(y), 1) },
  { id: "forsta-maj", namn: "Första maj", kort: "Första maj", slug: "forsta-maj", typ: "rod",
    regel: "Första maj är arbetarrörelsens högtidsdag och infaller alltid den 1 maj.", berakna: (y) => datum(y, 5, 1) },
  { id: "kristi-himmelsfardsdag", namn: "Kristi himmelsfärdsdag", kort: "Kristi himmelsfärd", slug: "kristi-himmelsfardsdag", typ: "rod",
    regel: "Kristi himmelsfärdsdag är sjätte torsdagen efter påskdagen, det vill säga 39 dagar efter påskdagen. Dagen efter blir därför nästan alltid en klämdag.",
    berakna: (y) => plusDagar(paskdagen(y), 39) },
  { id: "pingstdagen", namn: "Pingstdagen", kort: "Pingst", slug: "pingst", typ: "rod",
    regel: "Pingstdagen är sjunde söndagen efter påskdagen (49 dagar efter). Annandag pingst är inte längre en helgdag – den ersattes 2005 av nationaldagen.",
    berakna: (y) => plusDagar(paskdagen(y), 49) },
  { id: "nationaldagen", namn: "Sveriges nationaldag", kort: "Nationaldagen", slug: "nationaldagen", typ: "rod",
    regel: "Sveriges nationaldag infaller alltid den 6 juni och har varit en allmän helgdag sedan 2005.", berakna: (y) => datum(y, 6, 6) },
  { id: "midsommarafton", namn: "Midsommarafton", kort: "Midsommar", slug: "midsommar", typ: "afton",
    regel: "Midsommarafton är fredagen mellan 19 och 25 juni. Den är ingen allmän helgdag enligt lag, men jämställs med söndag i semesterlagen och är ledig för de flesta.",
    berakna: (y) => forstaVeckodag(datum(y, 6, 19), 5) },
  { id: "midsommardagen", namn: "Midsommardagen", kort: "Midsommardagen", slug: "midsommardagen", typ: "rod",
    regel: "Midsommardagen är lördagen mellan 20 och 26 juni.", berakna: (y) => forstaVeckodag(datum(y, 6, 20), 6) },
  { id: "alla-helgons-dag", namn: "Alla helgons dag", kort: "Alla helgons dag", slug: "alla-helgons-dag", typ: "rod",
    regel: "Alla helgons dag är lördagen mellan 31 oktober och 6 november.", berakna: (y) => forstaVeckodag(datum(y, 10, 31), 6) },
  { id: "julafton", namn: "Julafton", kort: "Julafton", slug: "julafton", typ: "afton",
    regel: "Julafton infaller alltid den 24 december. Den är ingen allmän helgdag enligt lag, men jämställs med söndag i semesterlagen och är ledig för de flesta.",
    berakna: (y) => datum(y, 12, 24) },
  { id: "juldagen", namn: "Juldagen", kort: "Juldagen", slug: "juldagen", typ: "rod",
    regel: "Juldagen infaller alltid den 25 december.", berakna: (y) => datum(y, 12, 25) },
  { id: "annandag-jul", namn: "Annandag jul", kort: "Annandag jul", slug: "annandag-jul", typ: "rod",
    regel: "Annandag jul infaller alltid den 26 december.", berakna: (y) => datum(y, 12, 26) },
  { id: "nyarsafton", namn: "Nyårsafton", kort: "Nyårsafton", slug: "nyarsafton", typ: "afton",
    regel: "Nyårsafton infaller alltid den 31 december. Den är ingen allmän helgdag enligt lag, men jämställs med söndag i semesterlagen och är ledig för de flesta.",
    berakna: (y) => datum(y, 12, 31) },
];

export const helgdagBySlug = (slug) => HELGDAGAR.find((h) => h.slug === slug);

/** Alla helgdagar och helgaftnar ett år, sorterade på datum. */
export function helgdagarAr(y) {
  return HELGDAGAR.map((h) => ({ ...h, datum: h.berakna(y) })).sort((a, b) => a.datum - b.datum);
}

export const rodaDagarAr = (y) => helgdagarAr(y).filter((h) => h.typ === "rod");

/** Mängd med ISO-datum som är lediga (lördag/söndag räknas separat). */
export function ledigaHelgdagar(y) {
  const s = new Map();
  for (const yy of [y - 1, y, y + 1]) for (const h of helgdagarAr(yy)) s.set(iso(h.datum), h);
  return s;
}

/** Är dagen ledig för de flesta: helg, röd dag eller helgafton. */
export function arLedig(dt, cache = ledigaHelgdagar(dt.getUTCFullYear())) {
  return arHelg(dt) || cache.has(iso(dt));
}

/** Klämdagar: vardagar som kläms mellan en ledig dag före och en ledig dag efter. */
export function klamdagarAr(y) {
  const cache = ledigaHelgdagar(y);
  const res = [];
  for (let dt = datum(y, 1, 1); dt.getUTCFullYear() === y; dt = plusDagar(dt, 1)) {
    if (arLedig(dt, cache)) continue;
    const fore = plusDagar(dt, -1), efter = plusDagar(dt, 1);
    if (arLedig(fore, cache) && arLedig(efter, cache)) {
      const orsak = cache.get(iso(fore)) || cache.get(iso(efter));
      // Hur många dagar i rad blir man ledig om man tar klämdagen?
      let start = dt, slut = dt;
      while (arLedig(plusDagar(start, -1), cache)) start = plusDagar(start, -1);
      while (arLedig(plusDagar(slut, 1), cache)) slut = plusDagar(slut, 1);
      res.push({ datum: dt, orsak, ledigFran: start, ledigTill: slut, ledigaDagar: dagarMellan(start, slut) + 1 });
    }
  }
  return res;
}

/** Långhelger: sammanhängande lediga perioder på minst 3 dagar som innehåller en helgdag. */
export function langhelgerAr(y) {
  const cache = ledigaHelgdagar(y);
  const res = [];
  let dt = datum(y, 1, 1);
  while (dt.getUTCFullYear() === y) {
    if (!arLedig(dt, cache)) { dt = plusDagar(dt, 1); continue; }
    let start = dt, slut = dt;
    while (arLedig(plusDagar(slut, 1), cache)) slut = plusDagar(slut, 1);
    const dagar = dagarMellan(start, slut) + 1;
    const helg = [];
    for (let d = start; d <= slut; d = plusDagar(d, 1)) if (cache.has(iso(d))) helg.push(cache.get(iso(d)));
    if (dagar >= 3 && helg.length) res.push({ fran: start, till: slut, dagar, helgdagar: helg });
    dt = plusDagar(slut, 1);
  }
  return res;
}

/** Arbetsdagar per månad (vardagar som inte är röda dagar eller helgaftnar). */
export function arbetsdagarAr(y) {
  const cache = ledigaHelgdagar(y);
  const manader = Array.from({ length: 12 }, () => 0);
  for (let dt = datum(y, 1, 1); dt.getUTCFullYear() === y; dt = plusDagar(dt, 1)) {
    if (!arLedig(dt, cache)) manader[dt.getUTCMonth()]++;
  }
  return { manader, totalt: manader.reduce((a, b) => a + b, 0) };
}

// --- Flaggdagar enligt förordning (1982:270) om allmänna flaggdagar ---
const RIKSDAGSVAL_FORSTA = 2022; // val hålls vart fjärde år, andra söndagen i september
const EU_VAL = { 2024: datum(2024, 6, 9) }; // fylls på när datum för kommande EU-val beslutas

export function flaggdagarAr(y) {
  const p = paskdagen(y);
  const lista = [
    [datum(y, 1, 1), "Nyårsdagen"],
    [datum(y, 1, 28), "Konungens namnsdag"],
    [datum(y, 3, 12), "Kronprinsessans namnsdag"],
    [p, "Påskdagen"],
    [datum(y, 4, 30), "Konungens födelsedag"],
    [datum(y, 5, 1), "Första maj"],
    [plusDagar(p, 49), "Pingstdagen"],
    [datum(y, 6, 6), "Sveriges nationaldag"],
    [forstaVeckodag(datum(y, 6, 20), 6), "Midsommardagen"],
    [datum(y, 7, 14), "Kronprinsessans födelsedag"],
    [datum(y, 8, 8), "Drottningens namnsdag"],
    [datum(y, 10, 24), "FN-dagen"],
    [datum(y, 11, 6), "Gustav Adolfsdagen"],
    [datum(y, 12, 10), "Nobeldagen"],
    [datum(y, 12, 23), "Drottningens födelsedag"],
    [datum(y, 12, 25), "Juldagen"],
  ];
  if ((y - RIKSDAGSVAL_FORSTA) % 4 === 0 && y >= RIKSDAGSVAL_FORSTA) {
    lista.push([plusDagar(forstaVeckodag(datum(y, 9, 1), 0), 7), "Valdagen (val till riksdagen)"]);
  }
  if (EU_VAL[y]) lista.push([EU_VAL[y], "Valdagen (val till Europaparlamentet)"]);
  return lista.map(([d, namn]) => ({ datum: d, namn })).sort((a, b) => a.datum - b.datum);
}

/** Nästa röda dag (eller helgafton) från och med ett datum. */
export function nastaHelgdag(fran, bara = null) {
  for (const y of [fran.getUTCFullYear(), fran.getUTCFullYear() + 1]) {
    const h = helgdagarAr(y).find((h) => h.datum >= fran && (!bara || h.typ === bara));
    if (h) return h;
  }
}

/** Nästa förekomst (i år eller nästa år) av en viss helgdag. */
export function nastaForekomst(h, fran) {
  const iAr = h.berakna(fran.getUTCFullYear());
  return iAr >= fran ? iAr : h.berakna(fran.getUTCFullYear() + 1);
}
