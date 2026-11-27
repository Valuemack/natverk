// Faktatexter om drivmedlen. Bara uppgifter som går att belägga; inga prognoser.
export const OM_DRIVMEDEL = {
  bensin95: {
    ingress: "Blyfri bensin med 95 oktan är det vanligaste drivmedlet för personbilar i Sverige.",
    stycken: [
      "Bensin 95 får enligt den europeiska standarden innehålla upp till 10 procent etanol. Pumpen är märkt E5 eller E10 efter hur mycket etanol bensinen högst innehåller. De flesta bensinbilar tål E10, men kontrollera instruktionsboken eller tanklocket om du är osäker.",
      "Bränslebolagen omfattas av reduktionsplikten: de måste blanda in förnybart så att växthusgasutsläppen från bensinen minskar med en viss procent. Sedan den 1 juli 2025 är nivån 10 procent för bensin (6 procent under 2024), och i bensin blandas etanol in.",
      "Ungefär halva priset är skatt: energiskatt, koldioxidskatt och moms. Resten är produktkostnad, frakt och bolagens marginal, som följer världsmarknadspriset på bensin och kronans värde mot dollarn.",
    ],
  },
  bensin98: {
    ingress: "Bensin 98 har högre oktantal än 95 och är avsedd för motorer som kräver eller rekommenderar högoktanig bensin.",
    stycken: [
      "Oktantalet anger hur väl bensinen motstår självantändning (knackning) i motorn. En vanlig bil som är gjord för 95 blir inte snabbare eller snålare av 98. Står det i instruktionsboken att motorn kräver 98 ska du däremot tanka 98.",
      "98 kostar oftast mellan en och två kronor mer per liter än 95. Skillnaden i kronor per liter syns i tabellerna på den här sidan och uppdateras varje natt.",
    ],
  },
  diesel: {
    ingress: "Diesel används av dieselbilar, lastbilar, bussar och arbetsmaskiner. Den diesel som säljs vid svenska pumpar är miljöklass 1 (MK1).",
    stycken: [
      "Dieselns pris följer världsmarknadspriset på diesel (gasolja), som inte alltid går i takt med bensinen. Efterfrågan från industri, sjöfart och uppvärmning påverkar, liksom tillgången på raffinaderikapacitet.",
      "Diesel omfattas också av reduktionsplikten, som sedan den 1 juli 2025 är 10 procent (6 procent under 2024). Den uppfylls med förnybara komponenter som HVO.",
      "En dieselbil drar oftast mindre bränsle per mil än en motsvarande bensinbil. Därför kan diesel löna sig trots ett högre literpris. Räkna på din egen förbrukning i bränslekalkylatorn.",
    ],
  },
  e85: {
    ingress: "E85 är etanolbränsle för flexifuelbilar (FFV). Etanolhalten är 70–85 procent beroende på årstid; vinterkvaliteten har lägre etanolhalt så att bilen startar i kyla.",
    stycken: [
      "Etanol innehåller mindre energi per liter än bensin. En flexifuelbil drar därför ungefär 25–35 procent mer bränsle på E85 än på bensin. E85 lönar sig alltså bara om literpriset är tillräckligt mycket lägre än för 95.",
      "Bara bilar som är byggda för E85 (FFV) får tankas med E85. I en vanlig bensinbil kan E85 skada motor och bränslesystem.",
    ],
  },
  hvo100: {
    ingress: "HVO100 är förnybar diesel som tillverkas genom vätebehandling av vegetabiliska oljor och fetter, till exempel slakteriavfall och restprodukter.",
    stycken: [
      "HVO100 är kemiskt mycket lik fossil diesel och uppfyller standarden EN 15940 (märkt XTL vid pumpen). Den kan användas i dieselfordon som tillverkaren har godkänt för HVO. Kontrollera instruktionsboken eller fråga märkesverkstaden.",
      "HVO100 är betydligt dyrare än vanlig diesel per liter. Förbrukningen är i stort sett densamma, så prisskillnaden per liter är också skillnaden i körkostnad.",
    ],
  },
  biogas: {
    ingress: "Fordonsgas är biogas, naturgas eller en blandning, och säljs per kilo. I Sverige är merparten av fordonsgasen biogas.",
    stycken: [
      "Ett kilo fordonsgas motsvarar energimässigt ungefär 1,5 liter bensin. Jämför därför kilopriset med 1,5 gånger literpriset för 95 när du räknar på vad som är billigast.",
      "Fordonsgas kan bara tankas i gasbilar. De flesta har också en mindre bensintank som används när gasen tar slut.",
    ],
  },
};

/** Kedjor: bara fakta vi kan belägga. */
export const OM_KEDJA = {
  Ingo: "Ingo är en obemannad lågpriskedja som ägs av Circle K.",
  Tanka: "Tanka är en obemannad lågpriskedja som ägs av OKQ8.",
};
