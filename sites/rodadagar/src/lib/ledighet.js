// Ledighet räknad ur helgdagsmotorn: semestertips ("ta X dagar, få Y lediga"),
// arbetsdagar per månad och helger (påsk, midsommar, jul …) per år. Allt beräknas.
import { datum, plusDagar, iso, arHelg, dagarMellan } from "@natverk/core/datum.js";
import { HELGDAGAR, ledigaHelgdagar, arLedig } from "./helgdagar.js";

const hd = (id, y) => {
  const h = HELGDAGAR.find((x) => x.id === id);
  return { ...h, datum: h.berakna(y) };
};

/**
 * Helger som får en egen sida per år (/pask/2027/). Varje grupp samlar de dagar som hör ihop,
 * så att t.ex. långfredagen, påskafton, påskdagen och annandag påsk hamnar på samma sida.
 */
export const GRUPPER = [
  { slug: "trettondedag-jul", namn: "Trettondedag jul", huvud: "trettondedag-jul", ids: ["trettondedag-jul"],
    om: "Trettondedag jul, även kallad trettondagen, är röd dag med fast datum den 6 januari. Den hamnar därför på olika veckodagar från år till år, och när den infaller mitt i veckan kan några semesterdagar ge en lång ledighet direkt efter nyår." },
  { slug: "pask", namn: "Påsk", huvud: "paskdagen", ids: ["langfredagen", "paskafton", "paskdagen", "annandag-pask"],
    om: "Påskdagen är den första söndagen efter den första fullmånen på eller efter vårdagjämningen (räknad som 21 mars), och kan därför infalla mellan 22 mars och 25 april. Långfredagen, påskdagen och annandag påsk är röda dagar. Påskafton är ingen allmän helgdag enligt lag, men infaller alltid på en lördag. Påskhelgen ger alltid fyra lediga dagar i rad, fredag till måndag." },
  { slug: "forsta-maj", namn: "Första maj", huvud: "forsta-maj", ids: ["forsta-maj"],
    om: "Första maj är arbetarrörelsens högtidsdag och röd dag med fast datum. När den infaller på en tisdag eller torsdag blir måndagen respektive fredagen en klämdag." },
  { slug: "kristi-himmelsfardsdag", namn: "Kristi himmelsfärd", huvud: "kristi-himmelsfardsdag", ids: ["kristi-himmelsfardsdag"],
    om: "Kristi himmelsfärdsdag infaller alltid på en torsdag, 39 dagar efter påskdagen. Fredagen efter blir därför en klämdag varje år: tar du ledigt den dagen blir du ledig torsdag till söndag." },
  { slug: "pingst", namn: "Pingst", huvud: "pingstdagen", ids: ["pingstdagen"],
    om: "Pingstdagen infaller alltid på en söndag, 49 dagar efter påskdagen, och ger därför aldrig någon extra ledig vardag. Annandag pingst var röd dag till och med 2004 och ersattes 2005 av nationaldagen den 6 juni." },
  { slug: "nationaldagen", namn: "Nationaldagen", huvud: "nationaldagen", ids: ["nationaldagen"],
    om: "Sveriges nationaldag den 6 juni har varit allmän helgdag sedan 2005, då den ersatte annandag pingst. Den har fast datum. Infaller den på en lördag eller söndag flyttas den inte till en vardag enligt lag, och då ger den ingen extra ledig dag." },
  { slug: "midsommar", namn: "Midsommar", huvud: "midsommarafton", ids: ["midsommarafton", "midsommardagen"],
    om: "Midsommardagen är lördagen mellan 20 och 26 juni och är röd dag enligt lag. Midsommarafton, fredagen före, är ingen röd dag, men den jämställs med söndag i semesterlagen och de flesta är lediga. Midsommar ger därför tre lediga dagar i rad, fredag till söndag." },
  { slug: "alla-helgons-dag", namn: "Alla helgons dag", huvud: "alla-helgons-dag", ids: ["alla-helgons-dag"],
    om: "Alla helgons dag infaller alltid på lördagen mellan 31 oktober och 6 november och ger därför aldrig en ledig vardag. Dagen före, fredagen, kallas ibland allhelgonaafton men är en vanlig arbetsdag." },
  { slug: "julafton", namn: "Jul", huvud: "julafton", ids: ["julafton", "juldagen", "annandag-jul"],
    om: "Juldagen (25 december) och annandag jul (26 december) är röda dagar med fast datum. Julafton (24 december) är ingen röd dag enligt lag, men den jämställs med söndag i semesterlagen och de flesta är lediga. Hur lång julledigheten blir beror helt på vilka veckodagar dagarna hamnar på." },
  { slug: "nyarsafton", namn: "Nyår", huvud: "nyarsafton", ids: ["nyarsafton"], nastaAr: ["nyarsdagen"],
    om: "Nyårsdagen (1 januari) är röd dag. Nyårsafton (31 december) är ingen röd dag enligt lag, men den jämställs med söndag i semesterlagen och de flesta är lediga." },
];

export const gruppBySlug = (slug) => GRUPPER.find((g) => g.slug === slug);

/** Dagarna i en helg ett visst år (nyår tar med nyårsdagen året efter). */
export const gruppDagar = (g, y) => [...g.ids.map((id) => hd(id, y)), ...(g.nastaAr || []).map((id) => hd(id, y + 1))];
export const gruppHuvud = (g, y) => hd(g.huvud, y);

/** Länk till helg-per-år-sidan för en helgdagsslug, om sidan finns. */
export function helgArHref(slug, y, arLista) {
  if (slug === "nyarsdagen") y -= 1; // nyårsdagen hör till nyårshelgen året före
  const g = GRUPPER.find((x) => x.slug === slug) || GRUPPER.find((x) =>
    [...x.ids, ...(x.nastaAr || [])].some((id) => HELGDAGAR.find((h) => h.id === id)?.slug === slug));
  if (!g || !arLista.includes(y)) return null;
  return `/${g.slug}/${y}/`;
}

/** Sammanhängande lediga dagar runt ett datum (helg, röd dag eller helgafton). */
export function ledigPeriod(dt) {
  const cache = ledigaHelgdagar(dt.getUTCFullYear());
  if (!arLedig(dt, cache)) return null;
  let fran = dt, till = dt;
  while (arLedig(plusDagar(fran, -1), cache)) fran = plusDagar(fran, -1);
  while (arLedig(plusDagar(till, 1), cache)) till = plusDagar(till, 1);
  return { fran, till, dagar: dagarMellan(fran, till) + 1 };
}

/**
 * Semestertips runt några helgdagar: för k = 1 … maxK semesterdagar letas den längsta
 * sammanhängande ledigheten som innehåller minst en av helgdagarna på en vardag. Bara de
 * k där sista semesterdagen bryggar över till fler lediga dagar (mer än +1) behålls, så att
 * tipsen blir "ta 4 dagar, få 10 lediga" och inte "ta 3, få 7".
 */
export function semestertips(dagar, maxK = 5) {
  const ankare = dagar.map((d) => d.datum ?? d).filter((d) => !arHelg(d)).sort((a, b) => a - b);
  if (!ankare.length) return [];
  const cache = ledigaHelgdagar(ankare[0].getUTCFullYear());
  for (const h of ledigaHelgdagar(ankare.at(-1).getUTCFullYear()).entries()) cache.set(...h);
  const W = [];
  for (let d = plusDagar(ankare[0], -35); d <= plusDagar(ankare.at(-1), 35); d = plusDagar(d, 1)) {
    if (!arLedig(d, cache)) W.push(d);
  }
  const inom = (s, e) => ankare.some((a) => a >= s && a <= e);
  // k = 0: ledigheten man får utan att ta semester
  let forra = Math.max(0, ...ankare.map((a) => ledigPeriodCache(a, cache)));
  const res = [];
  for (let k = 1; k <= maxK; k++) {
    let b = null;
    for (let i = 1; i + k < W.length; i++) {
      const fran = plusDagar(W[i - 1], 1), till = plusDagar(W[i + k], -1);
      if (!inom(fran, till)) continue;
      const n = dagarMellan(fran, till) + 1;
      if (!b || n > b.dagar) b = { semesterdagar: k, fran, till, dagar: n, ta: W.slice(i, i + k) };
    }
    if (!b) break;
    if (b.dagar - forra > 1) res.push(b);
    forra = b.dagar;
  }
  return res;
}

function ledigPeriodCache(dt, cache) {
  if (!arLedig(dt, cache)) return 0;
  let fran = dt, till = dt;
  while (arLedig(plusDagar(fran, -1), cache)) fran = plusDagar(fran, -1);
  while (arLedig(plusDagar(till, 1), cache)) till = plusDagar(till, 1);
  return dagarMellan(fran, till) + 1;
}

/**
 * Alla semestertips ett år, en rad per helg och antal semesterdagar. Nyårshelgen året före
 * tas med eftersom nyårsdagen ligger i januari.
 */
export function semestertipsAr(y) {
  const rader = [];
  const nyar = gruppBySlug("nyarsafton");
  for (const tips of semestertips(gruppDagar(nyar, y - 1))) rader.push({ ...tips, grupp: nyar, gruppAr: y - 1 });
  for (const g of GRUPPER) {
    for (const tips of semestertips(gruppDagar(g, y))) rader.push({ ...tips, grupp: g, gruppAr: y });
  }
  // samma ledighet kan nås från två helger (t.ex. jul och nyår): slå ihop dem
  const unika = new Map();
  for (const r of rader) {
    const nyckel = `${iso(r.fran)}|${iso(r.till)}|${r.semesterdagar}`;
    const namn = r.grupp.slug === "nyarsafton" ? `Nyår ${r.gruppAr}–${r.gruppAr + 1}` : r.grupp.namn;
    const finns = unika.get(nyckel);
    if (finns) finns.grupper.push(namn);
    else unika.set(nyckel, { ...r, grupper: [namn] });
  }
  return [...unika.values()].sort((a, b) => a.fran - b.fran);
}

/** De mest lönsamma semestertipsen (flest lediga dagar per semesterdag). */
export const bastaTips = (tips, n = 5) =>
  [...tips].sort((a, b) => b.dagar / b.semesterdagar - a.dagar / a.semesterdagar || b.dagar - a.dagar).slice(0, n);

/**
 * Arbetsdagar per månad, exakt räknat: vardagar (mån–fre) minus röda dagar på vardag och
 * helgaftnar (midsommarafton, julafton, nyårsafton) på vardag. Båda varianterna redovisas
 * eftersom helgaftnarna inte är lediga enligt lag men är det för de flesta.
 */
export function arbetsdagarDetalj(y) {
  const cache = ledigaHelgdagar(y);
  const manader = Array.from({ length: 12 }, () => ({ kalenderdagar: 0, vardagar: 0, rodaVardag: [], aftnarVardag: [] }));
  for (let dt = datum(y, 1, 1); dt.getUTCFullYear() === y; dt = plusDagar(dt, 1)) {
    const m = manader[dt.getUTCMonth()];
    m.kalenderdagar++;
    if (arHelg(dt)) continue;
    m.vardagar++;
    const h = cache.get(iso(dt));
    if (h?.typ === "rod") m.rodaVardag.push(h);
    else if (h?.typ === "afton") m.aftnarVardag.push(h);
  }
  for (const m of manader) {
    m.arbetsdagar = m.vardagar - m.rodaVardag.length - m.aftnarVardag.length;
    m.inklAftnar = m.vardagar - m.rodaVardag.length;
  }
  const summa = (lista) => lista.reduce((s, m) => ({
    kalenderdagar: s.kalenderdagar + m.kalenderdagar, vardagar: s.vardagar + m.vardagar,
    roda: s.roda + m.rodaVardag.length, aftnar: s.aftnar + m.aftnarVardag.length,
    arbetsdagar: s.arbetsdagar + m.arbetsdagar, inklAftnar: s.inklAftnar + m.inklAftnar,
  }), { kalenderdagar: 0, vardagar: 0, roda: 0, aftnar: 0, arbetsdagar: 0, inklAftnar: 0 });
  const kvartal = [0, 1, 2, 3].map((q) => summa(manader.slice(q * 3, q * 3 + 3)));
  return { manader, kvartal, totalt: summa(manader) };
}
