// Ämneshubbar: fasta ämnen som många artiklar delar, så att hubbsidorna samlar rätt artiklar även när skribenten
// har valt ett närliggande ämnesord. Skrivmotorn ombeds använda namnen exakt (scripts/skriv.mjs), och äldre artiklar
// kopplas hit via synonymerna. Hubben visas först när den har minst tre artiklar (MIN_AMNE i artiklar.js).
// Slug = URL-segment under /amne/, ändras aldrig.
export const AMNESHUBBAR = [
  { slug: "rymden", namn: "rymden", synonymer: ["rymdforskning", "astronomi", "rymdteknik", "rymdfart", "esa", "nasa", "jaxa", "asteroider", "planetförsvar", "merkurius", "mars", "månen", "exoplaneter", "galaxer", "svarta hål", "kvasarer", "teleskop"] },
  { slug: "klimatet", namn: "klimatet", synonymer: ["klimat", "klimatförändringar", "klimatomställning", "utsläpp", "koldioxid", "växthusgaser", "kolsänkor", "torvmarker"] },
  { slug: "fornybar-energi", namn: "förnybar energi", synonymer: ["solkraft", "solenergi", "solceller", "vindkraft", "havsbaserad vindkraft", "vätgas", "vattenkraft", "energilagring", "elsystem", "fusionsenergi"] },
  { slug: "medicinska-genombrott", namn: "medicinska genombrott", synonymer: ["cancerforskning", "cancer", "prostatacancer", "bröstcancer", "immunterapi", "läkemedel", "vaccin", "vacciner", "genterapi", "behandling", "diagnostik", "sarkom"] },
  { slug: "biologisk-mangfald", namn: "biologisk mångfald", synonymer: ["återförvildning", "vilda djur", "hotade arter", "artskydd", "naturvård", "fåglar", "fågelskydd", "pollinatörer", "insekter", "korallrev"] },
  { slug: "rent-vatten", namn: "rent vatten", synonymer: ["vatten", "vattenrening", "pfas", "miljögifter", "havsmiljö", "sjöar", "dricksvatten"] },
  { slug: "transporter", namn: "transporter", synonymer: ["kollektivtrafik", "elflyg", "sjöfart", "transport", "trafiksäkerhet", "järnväg", "elbilar", "cykling"] },
  { slug: "arbetsmarknad", namn: "arbetsmarknad", synonymer: ["arbetslöshet", "sysselsättning", "jobb"] },
  { slug: "kulturarv", namn: "kulturarv", synonymer: ["museer", "byggnadsvård", "arkeologi", "fornfynd", "arkiv"] },
  { slug: "artificiell-intelligens", namn: "artificiell intelligens", synonymer: ["ai", "maskininlärning"] },
  { slug: "genetik", namn: "genetik", synonymer: ["gener", "dna", "genomik", "helgenomsekvensering", "cellforskning"] },
  { slug: "mat-och-jordbruk", namn: "mat och jordbruk", synonymer: ["jordbruk", "odling", "livsmedel", "mat", "växtförädling", "fiske"] },
];

const HUBB_AV = new Map(AMNESHUBBAR.flatMap((h) => [[h.namn, h], ...h.synonymer.map((s) => [s, h])]));

/** Hubben som ett ämnesord hör till, eller null. */
export const hubbFor = (tagg) => HUBB_AV.get(String(tagg).toLowerCase().trim()) ?? null;
