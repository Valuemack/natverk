// Alla guider på sajten, grupperade efter ämne. Används av /guider/, startsidan och /llms.txt.
// Varje guide är en egen sida i src/pages/guider/ med källor och granskningsdatum.
export const GUIDEGRUPPER = [
  { rubrik: "Köpa och fynda", guider: [
    { slug: "oppettider-second-hand", namn: "När har loppisarna öppet?", text: "Öppettiderna för alla butiker i Sverige: helgöppet, kvällar och skillnaderna mellan organisationerna." },
    { slug: "kopa-begagnat-rattigheter", namn: "Köpa begagnat – dina rättigheter", text: "Reklamation i butik, på loppis och av privatperson enligt konsumentköplagen och köplagen." },
    { slug: "begagnade-barnprodukter", namn: "Begagnade leksaker och barnprodukter", text: "Vad myndigheterna säger om gamla plastleksaker, bilbarnstolar, hjälmar, barnsängar och vagnar." },
    { slug: "silverstamplar-guldstamplar", namn: "Silverstämplar och guldstämplar", text: "Så läser du stämplarna på loppisfyndet: tre kronor, årsbokstav, halt och nysilver." },
  ] },
  { rubrik: "Skänka och välgörenhet", guider: [
    { slug: "skanka-mobler-och-saker", namn: "Vad tar second hand-butikerna emot?", text: "Möbler, elektronik, kläder och bilbarnstolar – organisation för organisation, och vem som hämtar gratis." },
    { slug: "vad-hander-med-det-du-skanker", namn: "Vad händer med det du skänker?", text: "Hur mycket som säljs i Sverige, exporteras eller återvinns, enligt organisationernas egna siffror." },
    { slug: "valgorenhet-vart-gar-pengarna", namn: "Vem driver butikerna och vart går pengarna?", text: "Röda Korset, Myrorna, Erikshjälpen, Stadsmissionen, PMU med flera jämförda." },
    { slug: "second-hand-miljo", namn: "Second hand och miljön", text: "Naturvårdsverkets textilstatistik, IVL:s beräkningar och vad ett begagnat köp sparar." },
  ] },
  { rubrik: "Sälja och ha egen loppis", guider: [
    { slug: "skatt-salja-privat", namn: "Skatt när du säljer privat", text: "50 000-kronorsregeln, schablonen på 25 procent, hobby eller företag och plattformarnas rapportering." },
    { slug: "ha-egen-loppis", namn: "Ha en egen loppis – tillstånd och regler", text: "Polistillstånd, skyltar längs vägen, fika, lotteri och föreningsloppis." },
  ] },
];
export const GUIDER = GUIDEGRUPPER.flatMap((g) => g.guider).map((x) => ({ ...x, href: `/guider/${x.slug}/` }));
