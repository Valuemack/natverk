// Verifierade uppgifter om organisationerna bakom välgörenhetsbutikerna: vem som driver dem, vart överskottet går
// och vad butikerna tar emot som gåva. Allt är hämtat från organisationernas egna sidor och rapporter 2026-11-27
// (se källa per organisation) och skrivet med egna ord. Uppgifter som inte gick att bekräfta finns inte med.
// Används av kommunsidorna (bara för organisationer som har butik i kommunen), länssidorna och guiderna.

export const HAMTAT = "2026-11-27";

export const ORG = {
  "Röda Korset": {
    namn: "Röda Korset",
    driver: "De lokala Röda Korset-föreningarna driver butikerna med volontärer. Svenska Röda Korset är en ideell förening som grundades 1865.",
    andamal: "Överskottet går till Röda Korsets hjälpverksamhet i Sverige och utomlands.",
    tar: "Hela, rena och fungerande kläder och textil, glas och porslin, elprylar, böcker, sport- och fritidssaker och mindre möbler (fråga butiken först om möbler).",
    tarInte: "Bilbarnstolar, hjälmar, flytvästar, vitvaror, tjock-tv och gamla skärmar, uppslagsverk, VHS-band, farligt avfall och föremål av hotade arter.",
    hamtning: "Vissa butiker hämtar större gåvor – fråga din butik.",
    nittio: true,
    kalla: { namn: "Röda Korset – Skänk till second hand", url: "https://www.rodakorset.se/second-hand/skank-till-second-hand/" },
  },
  "Erikshjälpen Second Hand": {
    namn: "Erikshjälpen Second Hand",
    driver: "Butikerna drivs av en egen juridisk person inom Erikshjälpen, med anställda, praktikanter och volontärer.",
    andamal: "Överskottet går till Erikshjälpens arbete för barns rättigheter. År 2025 stod butikernas överskott för 28 procent av Erikshjälpens finansiering.",
    tar: "Hela, rena och säljbara möbler, husgeråd, kläder, skor, böcker, elektronik, leksaker, sportsaker och hemtextil – gärna packat per sort.",
    tarInte: "Bilbarnstolar, hjälmar, flytvästar, vitvaror, tjock-tv, lysrör, skrivare, pianon, uppslagsverk, mjuka plastleksaker från före 2013 och farligt avfall (enstaka butiker gör undantag).",
    hamtning: "Gratis hämtning bokas hos den lokala butiken; du behöver vara hemma.",
    nittio: true,
    kalla: { namn: "Erikshjälpen – Skänk till second hand", url: "https://erikshjalpen.se/vara-butiker/skank-till-second-hand/" },
  },
  Myrorna: {
    namn: "Myrorna",
    driver: "Myrorna är en del av Frälsningsarmén och har anställd personal. Verksamheten har funnits sedan 1896.",
    andamal: "Hela överskottet går till Frälsningsarméns sociala arbete i Sverige – 16 miljoner kronor år 2025.",
    tar: "Hela och rena kläder, skor, väskor, leksaker, glas och porslin, elprylar, möbler (bara i de större butikerna – ring först) och dödsbon.",
    tarInte: "Tjock-tv, uppslagsverk, stora mängder böcker, pianon och däck.",
    hamtning: "Myrornabilen hämtar gratis efter bokning. Kläder kan också skickas gratis via PostNord-ombud, och Myrorna har över 300 insamlingsboxar.",
    nittio: true,
    kalla: { namn: "Myrorna – Lämna in", url: "https://www.myrorna.se/lamna-in/" },
  },
  "PMU Second Hand": {
    namn: "PMU Second Hand",
    driver: "PMU är en del av Pingströrelsen (Pingst – fria församlingar i samverkan). De flesta butiker drivs ihop med en lokal församling och till stor del av volontärer.",
    andamal: "Överskottet går till bistånd och till lokala sociala projekt.",
    tar: "Hela och rena saker, bland annat möbler, elektronik, böcker och media.",
    tarInte: "Bilbarnstolar, hjälmar, flytvästar, tjock-tv och gamla skärmar, uppslagsverk, VHS-band, pianon, vävstolar, kontorsmöbler och plastleksaker äldre än tio år. Ställ aldrig saker utanför butiken.",
    hamtning: "De flesta butiker hämtar gratis vid större mängder, till exempel dödsbon.",
    nittio: true,
    kalla: { namn: "PMU – Gåvomottagning", url: "https://pmu.se/secondhand/gavomottagning/" },
  },
  "Stockholms Stadsmission": {
    namn: "Stockholms Stadsmission",
    driver: "Stockholms Stadsmission är en idéburen organisation från 1853, fristående från stat, kommun och kyrka.",
    andamal: "Överskottet går till Stadsmissionens sociala verksamhet. Gåvorna sorteras på lagret i Västerhaninge och en del går direkt till människor i utsatthet.",
    tar: "Kläder, prylar och små möbler i alla butiker. Större möbler tas emot på återvinningscentralerna Lövsta, Roslagstull, Vantör och Salmunge.",
    tarInte: "Sängar, madrasser, sänggavlar, soffor, garderober och möbler i spånskiva, vitvaror, tjock-tv, bilbarnstolar och annan säkerhetsutrustning, barometrar, termometrar och plastleksaker äldre än tio år.",
    hamtning: null,
    nittio: true,
    kalla: { namn: "Stockholms Stadsmission – Skänk kläder och prylar", url: "https://www.stadsmissionen.se/ge-stod/skank-klader-och-prylar" },
  },
  "Göteborgs Stadsmission": {
    namn: "Göteborgs Stadsmission",
    driver: "Göteborgs Stadsmission driver sina butiker som en del av sitt sociala arbete.",
    andamal: "Överskottet stannar i Stadsmissionens verksamhet. Osåld textil kan bli nya produkter eller delas ut i den sociala verksamheten.",
    tar: "Kläder och prylar i alla butiker och på insamlingscentralen på Korpralsgatan 2. Möbler tas emot i Alingsås och på Alelyckan, men inte isärplockade.",
    tarInte: "Stora soffor, hörn- och bäddsoffor, använda madrasser, vitvaror, tjock-tv, skrivare, kontorsmöbler, pianon och solarier.",
    hamtning: "Hämtning bara för större mängder, via insamlingscentralen.",
    nittio: true,
    kalla: { namn: "Göteborgs Stadsmission – Att skänka", url: "https://www.stadsmissionen.org/second-hand/att-skanka/" },
  },
  Björkåfrihet: {
    namn: "Björkåfrihet (f.d. Emmaus Björkå)",
    driver: "Björkåfrihet är en ideell förening som hette Emmaus Björkå fram till 2019.",
    andamal: "Överskottet går till solidaritetsprojekt, bland annat för asylrätt och mot rasism.",
    tar: "Kläder, textil och prylar via insamlingsplatser och boxar. Gåvorna sorteras i Göteborg.",
    tarInte: "Madrasser, sänggavlar och stora möbler, vitvaror, tjock-tv, bilbarnstolar, flytvästar, routrar, skrivare, batterier, uppslagsverk, däck och byggmaterial.",
    hamtning: "Ingen hämtning.",
    nittio: true,
    kalla: { namn: "Björkåfrihet – Vad vi ej tar emot", url: "https://bjorkafrihet.se/vad-vi-ej-tar-emot/" },
  },
  Artikel2: {
    namn: "Artikel2 (f.d. Emmaus Stockholm)",
    driver: "Artikel2 är en ideell, medlemsstyrd förening som hette Emmaus Stockholm fram till 2023.",
    andamal: "Överskottet går till utvecklingsprojekt, främst utomlands.",
    tar: "Kläder, textil, husgeråd, fungerande småelektronik, tavlor och mattor. Möbler bara i butiken i Kista Galleria.",
    tarInte: "Studentlitteratur, uppslagsverk och våt eller möglig textil.",
    hamtning: null,
    nittio: true,
    kalla: { namn: "Artikel2 – Vad du kan skänka", url: "https://artikel2.se/skank/vad-du-kan-skanka/" },
  },
  "Hela Människan": {
    namn: "Hela Människan",
    driver: "Hela Människan är kyrkornas gemensamma sociala arbete, med tolv kyrkor och kyrkliga organisationer som huvudmän.",
    andamal: "Överskottet går till det lokala sociala arbetet.",
    tar: null,
    tarInte: null,
    hamtning: null,
    nittio: true,
    kalla: { namn: "Hela Människan – Second hand", url: "https://helamanniskan.se/second-hand/" },
  },
  "Lindra Second Hand": {
    namn: "Lindra Second Hand",
    driver: "Lindra är en ideell förening som stöder Human Bridge, en stiftelse som samlar in och renoverar sjukvårdsutrustning till andra länder.",
    andamal: "Överskottet går till Human Bridge.",
    tar: null,
    tarInte: null,
    hamtning: null,
    nittio: null,
    kalla: { namn: "Lindra – Om Lindra Second Hand", url: "https://lindra.se/om-lindra-second-hand/" },
  },
};

const DOMAN = { "stadsmissionen.se": "Stockholms Stadsmission", "stadsmissionen.org": "Göteborgs Stadsmission", "bjorkafrihet.se": "Björkåfrihet", "artikel2.se": "Artikel2" };

/** Nyckel i ORG för en butik, eller null. Stadsmissionerna och Emmaus-föreningarna har olika regler och skiljs åt. */
export function orgNyckel(e) {
  if (e.organisation?.startsWith("Stockholms Stadsmission")) return "Stockholms Stadsmission";
  if (e.organisation?.startsWith("Göteborgs Stadsmission")) return "Göteborgs Stadsmission";
  if (e.organisation?.startsWith("Björkåfrihet")) return "Björkåfrihet";
  if (e.organisation?.startsWith("Artikel2")) return "Artikel2";
  const doman = (e.webb ?? "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  if (DOMAN[doman]) return DOMAN[doman];
  return ORG[e.kedja] ? e.kedja : null;
}
