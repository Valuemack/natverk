// Urvalssidor för hela landet. Egen fil eftersom getStaticPaths inte når komponentens konstanter.
const har = (u) => (e) => !!e.extra?.utrustning?.includes(u);

export const URVAL = {
  temalekplatser: {
    namn: "Temalekplatser",
    titel: (n) => `Temalekplatser i Sverige – ${n} tema- och naturlekplatser`,
    h1: "Temalekplatser och naturlekplatser",
    filter: (e) => e.typ !== "lekplats" || !!e.extra?.tema,
    intro: (n, l) => `${n} tema- och naturlekplatser i ${l} län. En temalekplats är byggd kring en berättelse eller miljö, till exempel sjörövare, rymden eller bondgården.`,
    fraga: "Vad är en temalekplats?",
    svar: "En temalekplats är en större lekplats där redskapen formar en helhet kring ett tema, som ett piratskepp, en borg eller en djungel. De är ofta utflyktsmål med toalett och sittplatser. En naturlekplats använder i stället stockar, stenar och växter.",
  },
  "lekplatser-med-linbana": {
    namn: "Lekplatser med linbana",
    titel: (n) => `Lekplatser med linbana – ${n} lekplatser i Sverige`,
    h1: "Lekplatser med linbana",
    filter: har("linbana"),
    intro: (n, l) => `${n} lekplatser i ${l} län har linbana enligt kommunernas och OpenStreetMaps uppgifter.`,
    fraga: "Från vilken ålder kan barn åka linbana?",
    svar: "De flesta linbanor på lekplatser är byggda för barn från ungefär fyra till fem år som själva kan hålla sig fast. Mindre barn bör åka med en vuxen bredvid.",
  },
  "lekplatser-med-vattenlek": {
    namn: "Lekplatser med vattenlek",
    titel: (n) => `Lekplatser med vattenlek – ${n} st i Sverige`,
    h1: "Lekplatser med vattenlek",
    filter: har("vattenlek"),
    intro: (n, l) => `${n} lekplatser i ${l} län har vattenlek, till exempel pump, ränna eller plaskdamm.`,
    fraga: "När är vattenleken igång?",
    svar: "Vattenlek på lekplatser är oftast igång från slutet av maj till början av september och stängs av under vintern. Kommunen eller parkförvaltningen bestämmer exakta datum.",
  },
  "lekplatser-med-studsmatta": {
    namn: "Lekplatser med studsmatta",
    titel: (n) => `Lekplatser med studsmatta – ${n} st i Sverige`,
    h1: "Lekplatser med studsmatta och hoppkudde",
    filter: (e) => har("studsmatta")(e) || har("hoppkudde")(e),
    intro: (n, l) => `${n} lekplatser i ${l} län har nedgrävd studsmatta eller hoppkudde.`,
    fraga: "Är studsmattor på lekplatser gratis?",
    svar: "Ja, studsmattor och hoppkuddar på kommunala lekplatser är gratis att använda. Hoppkuddar är ofta bara uppblåsta under sommarhalvåret.",
  },
  "lekplatser-med-kompisgunga": {
    namn: "Lekplatser med kompisgunga",
    titel: (n) => `Lekplatser med kompisgunga – ${n} st i Sverige`,
    h1: "Lekplatser med kompisgunga",
    filter: har("kompisgunga"),
    intro: (n, l) => `${n} lekplatser i ${l} län har kompisgunga, alltså en stor fågelbo- eller korggunga där flera barn kan gunga samtidigt.`,
    fraga: "Vad är en kompisgunga?",
    svar: "En kompisgunga är en stor rund gunga, ofta formad som ett fågelbo, där flera barn kan ligga eller sitta tillsammans. Den passar också barn som har svårt att sitta i en vanlig gunga.",
  },
  "tillgangliga-lekplatser": {
    namn: "Tillgänglighetsanpassade lekplatser",
    titel: (n) => `Tillgängliga lekplatser – ${n} anpassade lekplatser`,
    h1: "Tillgänglighetsanpassade lekplatser",
    filter: (e) => e.extra?.tillganglighet === "tillgänglighetsanpassad",
    intro: (n, l) => `${n} lekplatser i ${l} län är tillgänglighetsanpassade enligt kommunen, med till exempel fast underlag, ramper eller redskap som går att använda från rullstol.`,
    fraga: "Vad innebär en tillgänglighetsanpassad lekplats?",
    svar: "Det betyder oftast att man kan ta sig fram med rullstol eller rollator på fast underlag och att några redskap, som kompisgunga, sandbord eller karusell i marknivå, går att använda för barn med funktionsnedsättning. Vad som ingår skiljer sig mellan kommuner.",
  },
};
