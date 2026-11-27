// Vikterna för nyheternas ordning – samma för nattens urval (scripts/lib/poang.mjs) och förstasidans ordning
// (src/lib/artiklar.js), så att de aldrig kan glida isär. Intern mekanik: visas inte på sajten.
//
// Huvudfrågan är glädjen: skulle en vanlig läsare berätta det här vid middagsbordet och känna "wow, världen är en
// vacker plats"? Därefter betydelse, färskhet och källans tillit.
export const VIKTER = [
  { nyckel: "gladje", vikt: 0.5 },
  { nyckel: "betydelse", vikt: 0.2 },
  { nyckel: "farskhet", vikt: 0.15 },
  { nyckel: "tillit", vikt: 0.15 },
];

/** Aktualitetsbonus: högst så här många poäng (av 100) när nyheten matchar ett ämne som trendar just nu. */
export const AKTUALITET_MAX = 5;

const STANDARD = { betydelse: 0.5, farskhet: 0.5, tillit: 0.85 };

/** Glädje 0–1. Äldre bedömningar utan glädjepoäng: medel av positiv och hopp. */
export const gladjeAv = (p = {}) => p.gladje ?? ((p.positiv ?? 0.6) + (p.hopp ?? p.positiv ?? 0.6)) / 2;

/**
 * Poäng 0–100 ur delpoängen (0–1). aktualitet (0–1) ger en liten bonus, men poängen blir aldrig över 100.
 * Byråkratiska nyheter (upphandlingar, namnbyten, jubileer, tal, konferenser, standarder …) hamnar alltid lågt.
 */
export function viktadPoang(p = {}) {
  const v = (k) => (k === "gladje" ? gladjeAv(p) : p[k] ?? STANDARD[k]);
  const bas = VIKTER.reduce((s, x) => s + x.vikt * v(x.nyckel), 0);
  const poang = Math.min(100, Math.round(100 * bas + AKTUALITET_MAX * (p.aktualitet ?? 0)));
  return p.byrakratisk ? Math.min(poang, 25) : poang;
}

/** Nyhetstyper för förstasidans blandning ("salig blandning"). */
export const TYPER = {
  natur: "natur och djur som kommer tillbaka",
  manniskor: "människor som gör fina saker – volontärer, räddare, givare, barn och unga",
  medicin: "medicinska genombrott",
  klimat: "klimat och energi som blir bättre",
  rymden: "rymden och vetenskap som får en att säga wow",
  siffror: "världen i siffror – statistik som visar att något blir bättre",
  charm: "charmiga eller roliga nyheter",
  ovrigt: "övrigt",
};

/**
 * Salig blandning: tar listan i given ordning (bäst först) men hoppar över en nyhet om den skulle bli den tredje av
 * samma typ i rad, eller om typen redan har sin andel (~30 %) av de `n` första platserna. Går det inte att
 * uppfylla tas den bästa återstående. Inga nyheter försvinner – de hamnar bara längre ner.
 */
export function blanda(lista, { n = lista.length, maxIRad = 2, andel = 0.3, typAv = (a) => a.typ ?? "ovrigt" } = {}) {
  const kvar = [...lista];
  const ut = [];
  const tak = Math.max(2, Math.ceil(n * andel));
  const antal = {};
  while (kvar.length) {
    const iTopp = ut.length < n;
    const sista = ut.slice(-maxIRad).map(typAv);
    const iRad = (a) => sista.length === maxIRad && sista.every((s) => s === typAv(a));
    const ok = (a) => !iRad(a) && (!iTopp || (antal[typAv(a)] ?? 0) < tak);
    // Går båda reglerna inte att uppfylla: hellre en typ över sin andel än tre i rad; annars den bästa som är kvar.
    let i = kvar.findIndex(ok);
    if (i < 0) i = Math.max(0, kvar.findIndex((a) => !iRad(a)));
    const [a] = kvar.splice(i, 1);
    if (iTopp) antal[typAv(a)] = (antal[typAv(a)] ?? 0) + 1;
    ut.push(a);
  }
  return ut;
}
