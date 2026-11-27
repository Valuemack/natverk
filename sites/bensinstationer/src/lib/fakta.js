// Fasta fakta som de långa guiderna räknar med. Varje block har sin källa och det datum uppgiften kontrollerades.
// Ändra bara här när källan ändras – sidorna räknar om allt annat själva.

/** Skatteverket: energiskatt och koldioxidskatt i kr per liter, bensin MK1 och diesel MK1 (diesel anges i kr/m³ hos Skatteverket). Kontrollerad 2026-11-25. */
export const SKATTESATSER = {
  kalla: "https://www.skatteverket.se/foretag/skatterochavdrag/punktskatter/energiskatter/skattesatserochvissabelopp.4.15532c7b1442f256bae5e56.html",
  kontrollerad: "2026-11-25",
  perioder: [
    { fran: "2026-01-01", till: "2026-04-30", text: "1 jan–30 apr 2026", bensin: { energi: 1.52, co2: 3.27 }, diesel: { energi: 1.15, co2: 2.811 } },
    { fran: "2026-05-01", till: "2026-06-30", text: "1 maj–30 jun 2026", bensin: { energi: 0.70, co2: 3.27 }, diesel: { energi: 0.831, co2: 2.811 } },
    { fran: "2026-07-01", till: "2026-09-30", text: "1 jul–30 sep 2026", bensin: { energi: 0.70, co2: 0.87 }, diesel: { energi: 0.831, co2: 0.411 } },
    { fran: "2026-10-01", till: "2026-11-30", text: "1 okt–30 nov 2026", bensin: { energi: 1.52, co2: 0.87 }, diesel: { energi: 1.15, co2: 0.411 } },
    { fran: "2026-12-01", till: "2026-12-31", text: "1 dec–31 dec 2026", bensin: { energi: 1.52, co2: 3.27 }, diesel: { energi: 1.15, co2: 2.811 } },
    { fran: "2027-01-01", till: null, text: "Från 1 jan 2027", bensin: { energi: 1.62, co2: 3.27 }, diesel: { energi: 1.231, co2: 2.815 } },
  ],
};
export const MOMS = 0.25; // Mervärdesskattelagen (2023:200) 9 kap. 2 §; skatter utom momsen ingår i underlaget, 8 kap. 13 §.
export const ML_URL = "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/mervardesskattelag-2023200_sfs-2023-200/";
export const summa = (s) => s.energi + s.co2;
/** Skattesatsperioden som gäller ett visst datum (YYYY-MM-DD), eller null före 2026. */
export const periodFor = (d) => SKATTESATSER.perioder.find((p) => p.fran <= d && (!p.till || p.till >= d)) ?? null;
/** Nästa period efter den som gäller datumet d. */
export const nastaPeriod = (d) => SKATTESATSER.perioder.find((p) => p.fran > d) ?? null;

/** Energimyndigheten, värmevärden (MWh per m³ = kWh per liter; MWh per ton = kWh per kg). Kontrollerad 2026-11-25. */
export const VARMEVARDEN = {
  kalla: "https://www.energimyndigheten.se/statistik/ovrig-energistatistik/varmevarden-och-densiteter/",
  kontrollerad: "2026-11-25",
  bensin95: 8.94, // Motorbensin, 95 oktan, MK1 (med inblandning)
  bensin98: 8.94, // Motorbensin, 98 oktan, MK1
  bensinRen: 9.1, // Motorbensin, oinblandad
  diesel: 9.8, // Dieselbränsle MK1
  e85: 6.59, // E85
  etanol: 5.83, // Etanol, ren
  hvo100: 9.44, // BioHVO
  biogas: 13.8, // Flytande biogas (LBG), kWh per kg – energin per kilo metan är densamma i gasform
};

/** Trafikanalys, Körsträckor 2025 (Statistik 2026:10, publicerad 2026-09-21), ny metod. Mil per år och personbil. */
export const KORSTRACKOR = {
  kalla: "https://www.trafa.se/vagtrafik/korstrackor/",
  fil: "https://www.trafa.se/globalassets/statistik/vagtrafik/korstrackor/2025/korstrackor-2025---2026-09-21.xlsx",
  ar: 2025,
  publicerad: "2026-09-21",
  snitt: 1243, // alla personbilar
  privat: 1155, // ägda av fysiska personer
  perDrivmedel: [
    { namn: "Bensin", mil: 941, bilar: 2629070 },
    { namn: "Diesel", mil: 1462, bilar: 1718697 },
    { namn: "Etanol (E85)", mil: 998, bilar: 176166 },
    { namn: "Gas", mil: 1500, bilar: 35093 },
    { namn: "Elhybrid", mil: 1483, bilar: 234336 },
    { namn: "Laddhybrid", mil: 1724, bilar: 401359 },
    { namn: "El", mil: 1671, bilar: 472217 },
  ],
  // Tabell RS1: personbilar ägda av fysiska personer, genomsnittlig körsträcka i mil efter registreringslän.
  perLan: [
    ["Stockholms län", 1150], ["Uppsala län", 1207], ["Södermanlands län", 1147], ["Östergötlands län", 1158],
    ["Jönköpings län", 1200], ["Kronobergs län", 1187], ["Kalmar län", 1152], ["Gotlands län", 960],
    ["Blekinge län", 1139], ["Skåne län", 1160], ["Hallands län", 1166], ["Västra Götalands län", 1185],
    ["Värmlands län", 1163], ["Örebro län", 1146], ["Västmanlands län", 1149], ["Dalarnas län", 1114],
    ["Gävleborgs län", 1123], ["Västernorrlands län", 1108], ["Jämtlands län", 1136], ["Västerbottens län", 1098],
    ["Norrbottens län", 1085],
  ],
};

/** Lag (2017:1201) om reduktion av växthusgasutsläpp från bensin och diesel, 5 § (lydelse t.o.m. SFS 2025:576). Procent. Kontrollerad 2026-11-25. */
export const REDUKTIONSPLIKT = {
  lag: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-20171201-om-reduktion-av-vaxthusgasutslapp_sfs-2017-1201/",
  forordning: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-2025589-om-reduktion-av_sfs-2025-589/",
  energimyndigheten: "https://www.energimyndigheten.se/klimat/transporter/reduktionsplikt/",
  drivkraft: "https://drivkraftsverige.se/fakta-statistik/reduktionsplikten/",
  // 2018 enligt Drivkraft Sverige (införandet 1 juli 2018); 2020–2030 enligt lagens tabell. 2019 saknas i den lästa lagtexten och visas inte.
  nivaer: [
    { ar: "2018", bensin: 2.6, diesel: 19.3, not: "Vid införandet 1 juli 2018" },
    { ar: "2020", bensin: 4.2, diesel: 21 },
    { ar: "2021", bensin: 6, diesel: 26 },
    { ar: "2022", bensin: 7.8, diesel: 30.5 },
    { ar: "2023", bensin: 7.8, diesel: 30.5 },
    { ar: "2024", bensin: 6, diesel: 6, not: "Sänkt 1 januari 2024" },
    { ar: "2025", bensin: 10, diesel: 10, not: "10 % från 1 juli 2025" },
    { ar: "2026", bensin: 10, diesel: 10 },
    { ar: "2027–2030", bensin: 10, diesel: 10, not: "Beslutad nivå i lagen" },
  ],
  avgiftBensin: 5, // kr per kg CO2e som inte reducerats (förordning 2025:589, 25 §)
  avgiftDiesel: 4,
  avgiftTak: 7, // lagens 10 §: högst 7 kr per kg
};
