// Gemensamma uppgifter för de långa guidesidorna. Belopp och regler är kontrollerade mot källorna 2026-11-25.
// Ändra här, inte på varje sida.

/** Guidesidorna, i den ordning de visas i hubben /guider/ och på startsidan. */
export const GUIDER = [
  { href: "/sfi/", namn: "Sfi – nivåer, kurser och resultat", text: "Studievägar, kurserna 1A–3D, nya kursplanen 2027 och resultat per kommun." },
  { href: "/komvux-eller-folkhogskola/", namn: "Komvux eller folkhögskola?", text: "Betyg eller studieomdöme, behörighet, urvalsgrupp, CSN och kostnader jämförda." },
  { href: "/underskoterska/", namn: "Undersköterska på komvux", text: "Yrkespaketet på 1 500 poäng, bevis från Socialstyrelsen och hur lång tid det tar." },
  { href: "/meritvarde/", namn: "Räkna ut meritvärde", text: "Kalkylator för jämförelsetal och meritpoäng, och meritvärdet från grundskolan." },
  { href: "/yrkesvux/", namn: "Yrkesvux – yrkesutbildningar", text: "Alla yrkespaket med poäng och studietid, regionalt yrkesvux och CSN." },
  { href: "/csn/", namn: "CSN för komvux", text: "Kalkylator för studiemedel 2027, högre bidrag, barntillägg och fribelopp." },
  { href: "/ansoka/", namn: "Ansöka till komvux", text: "Rätt till komvux, urvalsordningen, terminer och att läsa i en annan kommun." },
  { href: "/distans/", namn: "Komvux på distans", text: "Hur stor andel som läser på distans i varje kommun och vad det innebär." },
  { href: "/hogskolebehorighet/", namn: "Högskolebehörighet via komvux", text: "Examen, särskild behörighet, urvalsgrupperna BI och BII och sista anmälningsdag." },
];

// CSN, heltid, kronor per vecka 2027 (csn.se, sidor uppdaterade 2026-11-23).
export const CSN_AR = 2027;
export const CSN = {
  vanligt: { bidrag: 1037, lan: 2384 },
  hogre: { bidrag: 2294, lan: 1127 },
  // Tilläggsbidrag för barn, kr per vecka per studietakt: index = antal barn (0–5). CSN-tabell 2027.
  barnVecka: { "1": [0, 196, 321, 386, 451, 516], "0.75": [0, 149, 244, 291, 338, 385], "0.5": [0, 95, 160, 195, 230, 265] },
  fribeloppHalvar: 115451, // heltid 20 veckor, kalenderhalvår 2027
};
export const CSN_VECKA = CSN.vanligt.bidrag + CSN.vanligt.lan;

/** Heltid på komvux: 20 verksamhetspoäng per vecka (förordningen 2011:1108, 2 kap. 1 §). */
export const POANG_PER_VECKA = 20;
export const veckor = (poang, takt = 1) => Math.ceil(poang / (POANG_PER_VECKA * takt));

export const tal = (v, d = 1) => (v == null ? "–" : Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d }));
export const pct = (v) => (v == null ? "–" : `${tal(v)} %`);
export const kr = (n) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

export const PUBLICERAD = "2026-11-25";
export const GRANSKAD = "2026-11-25";

// Källor som används på flera sidor.
export const K = {
  skollagen: { namn: "Skollagen (2010:800), 20 kap.", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/", text: "rätt till komvux och sfi, avgiftsfrihet, prövning och validering", datum: "2026-11-25" },
  forordningen: { namn: "Förordningen (2011:1108) om vuxenutbildning", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-20111108-om-vuxenutbildning_sfs-2011-1108/", text: "verksamhetspoäng, urvalsordning, kontinuerlig utbildning och examen", datum: "2026-11-25" },
  statistik: { namn: "Skolverket – kommunala jämförelsetal", url: "https://statistikdatabasen.skolverket.se/PxWeb/pxweb/sv/Skolverkets_statistikdatabas/", text: "elever, distans, anordnare och sfi-resultat per kommun", datum: "2026-11-19" },
  register: { namn: "Skolverket – Skolenhetsregistret", url: "https://www.skolverket.se/", text: "skolenheter med komvux och sfi", datum: "2026-11-19" },
  csn: { namn: "CSN – Studiemedel", url: "https://www.csn.se/bidrag-och-lan/studiemedel.html", text: "belopp 2027, åldersgränser och antal veckor", datum: "2026-11-25" },
  csnTakt: { namn: "CSN – Studietakt, heltid eller deltid", url: "https://www.csn.se/fragor-och-svar/hur-manga-poang-maste-jag-lasa-for-att-fa-fullt-studiemedel/studietakt---heltid-eller-deltid.html", text: "poäng per vecka på komvux", datum: "2026-11-25" },
  yrkespaket: { namn: "Skolverket – Yrkespaket och Gy25", url: "https://www.skolverket.se/styrning-och-ansvar/en-skola-i-forandring/tidigare-forandringar/yrkespaket-och-gy25", text: "yrkespaketen och deras omfattning i gymnasiepoäng", datum: "2026-11-25" },
  gy25: { namn: "Skolverket – Gy25, ämnesbetyg på gymnasial nivå", url: "https://www.skolverket.se/styrning-och-ansvar/en-skola-i-forandring/tidigare-forandringar/gy25----amnesbetyg-pa-gymnasial-niva", text: "ämnesbetyg i komvux från 1 juli 2025 och övergången till 2030", datum: "2026-11-25" },
  antagningKomvux: { namn: "Antagning.se – Gymnasieexamen från komvux", url: "https://www.antagning.se/sv/betyg-och-behorighet/gymnasial-vuxenutbildning/gymnasieexamen-fran-komvux/", text: "betyg från komvux och grundläggande behörighet", datum: "2026-11-25" },
};
