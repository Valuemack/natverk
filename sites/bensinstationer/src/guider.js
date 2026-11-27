// Alla guider på sajten, grupperade efter ämne. Används av /guider/ och /llms.txt.
export const GUIDEGRUPPER = [
  { rubrik: "Priset och skatten", guider: [
    { slug: "vad-bestar-bensinpriset-av", namn: "Bensinskatt – vad består bensinpriset av?", text: "Priset uppdelat i produkt, energi- och koldioxidskatt och moms, skattesatserna och nästa skatteändring." },
    { slug: "bensinpriset-2027", namn: "Bensinpriset 2027", text: "Vad skatteändringarna 1 december 2026 och 1 januari 2027 betyder per liter, per tank och per år." },
    { slug: "vad-paverkar-bensinpriset", namn: "Vad påverkar bensinpriset?", text: "Världsmarknaden, dollarkursen, skatterna, reduktionsplikten och säsongen – med data sedan 2005." },
    { slug: "varfor-ar-diesel-dyrare", namn: "Varför är diesel dyrare än bensin?", text: "Skillnaden år för år sedan 2005, uppdelad i produktpris, skatt och moms." },
    { slug: "bensinpris-genom-aren", namn: "Bensinpriset genom åren", text: "Pris per år sedan 1960, i dåtidens kronor och i dagens penningvärde." },
    { slug: "nar-ar-bensinen-billigast", namn: "Vilken dag är bensinen billigast?", text: "Veckodag, månad och tid på dygnet enligt 19 års dagliga listpriser." },
    { slug: "reduktionsplikt", namn: "Reduktionsplikten", text: "Nivåerna sedan 2018, vilka bränslen som omfattas och hur plikten påverkar priset." },
  ] },
  { rubrik: "Spara pengar", guider: [
    { slug: "billigaste-bensinen", namn: "Så hittar du billigaste bensinen", text: "Kedjornas listpriser, obemannade stationer per län och när en omväg lönar sig." },
    { slug: "spara-bransle", namn: "Spara bränsle", text: "Myndigheternas siffror om fart, däck, takbox och tomgång omräknade till kronor per år." },
    { slug: "tankkort-och-appar", namn: "Tankkort och appar per kedja", text: "Så betalar du hos de största kedjorna, rabatter och hur mycket som reserveras på kortet." },
    { slug: "milersattning", namn: "Milersättning jämfört med bränslekostnaden", text: "Skattefri milersättning för egen bil och förmånsbil mot vad milen kostar idag." },
  ] },
  { rubrik: "Välja drivmedel och bil", guider: [
    { slug: "95-eller-98", namn: "Bensin 95 eller 98?", text: "Oktantal, E10 och E5 och vad 98 kostar extra per tank och år." },
    { slug: "bensin-eller-diesel", namn: "Bensin eller diesel?", text: "Kostnad per mil och år med dagens priser, fordonsskatt och brytpunkten." },
    { slug: "elbil-eller-bensin", namn: "Elbil eller bensin?", text: "Kostnad per mil och år, och vid vilket elpris elbilen blir billigare." },
    { slug: "lonar-sig-e85", namn: "Lönar sig E85?", text: "Brytpunkten mellan E85 och 95 med dagens priser och merförbrukningen." },
    { slug: "hvo100-e85-fordonsgas", namn: "HVO100, E85 och fordonsgas", text: "Dagens priser, pris per kWh och per mil, och vilka bilar som kan tanka vad." },
    { slug: "hvo100-vilka-bilar", namn: "HVO100 – vilka bilar får tanka?", text: "Biltillverkarnas godkännanden, XTL-märkningen och HVO i kyla." },
    { slug: "fordonsgas-gasbil", namn: "Gasbil och fordonsgas", text: "Biogas, CNG och LBG, kilopriset omräknat och gastankens regler." },
    { slug: "vinterdiesel", namn: "Vinterdiesel", text: "Köldklasserna i svensk standard, datum per region och råd i kyla." },
    { slug: "alkylatbensin", namn: "Alkylatbensin", text: "För motorsåg, gräsklippare och båt – vad det är och var det säljs." },
  ] },
  { rubrik: "På vägen och vid pumpen", guider: [
    { slug: "tanka-langs-e4", namn: "Tanka längs E4", text: "Stationerna sträcka för sträcka från Helsingborg till Haparanda och de längsta luckorna." },
    { slug: "tanka-langs-e6", namn: "Tanka längs E6", text: "Från Trelleborg till Svinesund, luckor per drivmedel och sista stationerna före Norge." },
    { slug: "tanka-langs-e20", namn: "Tanka längs E20", text: "Från Malmö via Göteborg och Örebro till Stockholm." },
    { slug: "tanka-i-norge", namn: "Tanka i Norge", text: "Norska pumppriser mot svenska, tullreglerna och stationerna i gränskommunerna." },
    { slug: "tanka-utomlands", namn: "Tanka utomlands", text: "Pumpmärkningen E10, B7 och XTL, priser i Europa, betalning och vad du får ta med hem." },
    { slug: "obemannad-bensinstation", namn: "Obemannad bensinstation", text: "Så fungerar automaten och reservationen, och var de obemannade stationerna finns." },
    { slug: "truckdiesel-lastbil", namn: "Truckdiesel för lastbil", text: "Stationer med lastbilsdiesel per län, fordonslängd, parkering och regler för rast." },
    { slug: "feltankning", namn: "Feltankning", text: "Diesel i bensinbil eller tvärtom: vad du gör direkt och vad försäkringen betalar." },
    { slug: "bensindunk-regler", namn: "Bensindunk – regler", text: "Hur mycket bensin du får förvara och transportera, och 10-litersgränsen vid tullen." },
  ] },
];
export const GUIDER = GUIDEGRUPPER.flatMap((g) => g.guider).map((x) => ({ ...x, href: `/guider/${x.slug}/` }));
