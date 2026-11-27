// Alla guider på parkeringar.nu, grupperade efter ämne. Används av /guider/, startsidan, sidfoten och /llms.txt.
// En guide läggs bara till här när sidan finns i src/pages/guider/<slug>.astro.
export const GUIDEGRUPPER = [
  { rubrik: "Regler på gatan", guider: [
    { slug: "p-skiva", namn: "P-skiva – regler och var den gäller", text: "Hur du ställer skivan på närmast följande halvtimme, hur du läser skylten och vad en glömd skiva kostar." },
    { slug: "parkera-pa-gatan", namn: "Parkera på gatan natt och helg", text: "24-timmarsregeln, städnätter och servicedagar, helgdagsafton och vad som gäller på söndagar." },
    { slug: "parkeringsregler", namn: "Var får man inte parkera?", text: "Avstånden till korsning, övergångsställe och busshållplats, och förbuden i trafikförordningen." },
  ] },
  { rubrik: "Böter och avgifter", guider: [
    { slug: "parkeringsbot-eller-kontrollavgift", namn: "Parkeringsbot eller kontrollavgift?", text: "Felparkeringsavgift på gatan mot kontrollavgift på privat mark: lagarna, beloppen och vem som bestämmer." },
    { slug: "overklaga-parkeringsbot", namn: "Överklaga en parkeringsbot", text: "Steg för steg för felparkeringsavgift och kontrollavgift, tidsfrister och vad som brukar räcka som bevis." },
  ] },
  { rubrik: "Betala och hitta plats", guider: [
    { slug: "parkeringsappar", namn: "Parkeringsappar jämförda", text: "EasyPark, Parkster och operatörernas egna appar: avgifter, var de fungerar och betalning utan app." },
    { slug: "billig-parkering", namn: "Billig parkering – så betalar du mindre", text: "Vad en timme och ett dygn kostar i landets städer enligt vår data, och var det är gratis." },
    { slug: "boendeparkering", namn: "Boendeparkering i storstäderna", text: "Vem som får boendeparkering i Stockholm, Göteborg och Malmö, priserna och reglerna." },
  ] },
  { rubrik: "Särskilda behov", guider: [
    { slug: "parkeringstillstand-rorelsehindrade", namn: "Parkeringstillstånd för rörelsehindrade", text: "Vem som får tillståndet, hur du ansöker och var och hur länge du får parkera med det." },
    { slug: "ladda-elbil-parkering", namn: "Parkera och ladda elbil", text: "Regler för laddplatser, skylten \"laddplats\", avgifter och var det finns laddplatser i parkeringshus." },
  ] },
];
export const GUIDER = GUIDEGRUPPER.flatMap((g) => g.guider);
