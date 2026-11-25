// Skollov läsåret 2026/2027 (och det som publicerats för 2027/2028) i de tolv största kommunerna.
// Alla datum är hämtade 2026-11-25 från kommunens egen webbplats eller kommunens beslutsunderlag (URL per kommun).
// Gäller kommunala grundskolor. Fristående skolor kan ha egna tider. Ändra aldrig ett datum utan ny kontroll mot källan.
// Format: datum som "MM-DD" i angivet år; null = inte publicerat eller inte angivet på kommunens sida.

export const HAMTAD = "2026-11-25";

export const KOMMUNER = [
  { namn: "Stockholm", pasklov28: 16, vtSlut28: "06-13", url: "https://grundskola.stockholm/terminer-och-lov/",
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: "01-11", sportlov27: 9, sportDatum27: "1–5 mars", pasklov27: 13, paskDatum27: "30 mars–2 april",
    vtSlut27: "06-11", htStart27: "08-17", hostlov27: true, sportlov28: 9 },
  { namn: "Göteborg", url: "https://goteborg.se/wps/portal/enheter/sprakcentrum/mottagningsteamet/lasarstider-och-ledighet", lasLov: true,
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: "01-11", sportlov27: 7, sportDatum27: "15–19 februari", pasklov27: 13, paskDatum27: "26 mars–2 april",
    vtSlut27: "06-10", htStart27: null, hostlov27: false, sportlov28: null },
  { namn: "Malmö", pasklov28: 15, vtSlut28: "06-16", url: "https://malmo.se/Bo-och-leva/Utbildning-och-forskola/Grundskola/For-elever-och-vardnadshavare-i-grundskolan/Lasar-och-lov-i-grundskolan.html", lasLov: true,
    hostlov26: "v. 44", htSlut26: "12-22", vtStart27: "01-11", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 12, paskDatum27: "22–28 mars",
    vtSlut27: "06-11", htStart27: "08-18", hostlov27: true, sportlov28: 8 },
  { namn: "Uppsala", pasklov28: 15, vtSlut28: "06-13", url: "https://www.uppsala.se/contentassets/5cffd36f349f4ee0837ad14dd6e58062/5.-lasarstider-2026-2027.pdf", underlag: true,
    hostlov26: "v. 44", htSlut26: "12-22", vtStart27: "01-13", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 13, paskDatum27: "30 mars–2 april",
    vtSlut27: "06-10", htStart27: null, htNot: "17 eller 18 aug (ändring föreslagen)", hostlov27: true, sportlov28: 8, extra: "lov även 30 april 2027" },
  { namn: "Linköping", pasklov28: 15, vtSlut28: "06-13", url: "https://www.linkoping.se/forskola-och-utbildning/grundskola/lov-och-lasarstider-for-grundskola-och-anpassad-grundskola",
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: "01-07", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 13, paskDatum27: "29 mars–2 april",
    vtSlut27: "06-10", htStart27: "08-16", hostlov27: true, sportlov28: 8 },
  { namn: "Örebro", url: "https://www.orebro.se/barn--utbildning/lasarstider-for-grundskolor--gymnasieskolor.html",
    hostlov26: "v. 44", htSlut26: "12-22", vtStart27: "01-11", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 12, paskDatum27: "22–29 mars",
    vtSlut27: "06-10", htStart27: null, hostlov27: false, sportlov28: null },
  { namn: "Västerås", pasklov28: 15, vtSlut28: "06-09", url: "https://www.vasteras.se/barn-och-utbildning/grundskola/terminer-lov-och-ledigheter-i-grundskola.html", lasLov: true,
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: "01-11", sportlov27: 9, sportDatum27: "1–5 mars", pasklov27: 13, paskDatum27: "30 mars–2 april",
    vtSlut27: "06-10", htStart27: "08-16", hostlov27: true, sportlov28: 9 },
  { namn: "Helsingborg", pasklov28: 15, vtSlut28: "06-13", url: "https://helsingborg.se/forskola-och-utbildning/helsingborgs-stads-skolor/lasarstider-och-lov/",
    hostlov26: "v. 44", htSlut26: "12-22", vtStart27: "01-11", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 12, paskDatum27: "22–25 mars",
    vtSlut27: "06-10", htStart27: "08-18", hostlov27: true, sportlov28: 8 },
  { namn: "Norrköping", pasklov28: 15, vtSlut28: "06-14", url: "https://norrkoping.se/skola-och-forskola/aktuellt/lov-och-lasarstider",
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: null, vtNot: "terminen startar 7 jan med studiedagar", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 13, paskDatum27: "30 mars–2 april",
    vtSlut27: "06-10", htStart27: "08-18", hostlov27: true, sportlov28: 8 },
  { namn: "Jönköping", pasklov28: 15, vtSlut28: "06-15", url: "https://www.jonkoping.se/barn--utbildning/grundskola-anpassad-grundskola-och-fritidshem/lasarstider-lov-studiedagar-och-ledigheter-i-grundskola-och-anpassad-grundskola",
    hostlov26: "v. 44", htSlut26: "12-22", vtStart27: "01-11", sportlov27: 7, sportDatum27: null, pasklov27: 13, paskDatum27: null,
    vtSlut27: "06-10", htStart27: "08-18", hostlov27: true, sportlov28: 7 },
  { namn: "Umeå", pasklov28: 16, vtSlut28: "06-14", url: "https://www.umea.se/forskolaskolaochutbildning/grundskola/lasarstiderochlov.4.27a2de8b172da059ace1ee0.html", lasLov: true,
    hostlov26: "v. 44", htSlut26: "12-18", vtStart27: "01-11", sportlov27: 10, sportDatum27: "8–12 mars", pasklov27: 13, paskDatum27: "30 mars–2 april",
    vtSlut27: "06-09", htStart27: "08-23", hostlov27: true, sportlov28: 10 },
  { namn: "Lund", pasklov28: 15, vtSlut28: "06-14", url: "https://lund.se/forskola-och-skola/grundskola/lasar-och-lov-i-grundskolan",
    hostlov26: "26–30 okt", htSlut26: "12-18", vtStart27: "01-07", sportlov27: 8, sportDatum27: "22–26 februari", pasklov27: 12, paskDatum27: "22–25 mars",
    vtSlut27: "06-11", htStart27: "08-19", hostlov27: true, sportlov28: 8 },
];

export const SKOLFORORDNINGEN = "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skolforordning-2011185_sfs-2011-185/";
