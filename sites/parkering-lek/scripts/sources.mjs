// Manuellt granskade kommunala öppna datakällor (hittade via dataportal.se, se 01-discover-dataportal.mjs).
// licens: licensen som anges på distributionen/datasetet i dataportal.se (kontrollerad 2026-11-19).
//   "ej angiven" = ingen licens angiven i katalogen -> vi tar bara fakta (läge, namn, utrustning), aldrig fritext.
//   NC-licenser (icke-kommersiell) används inte eftersom sajterna är kommersiella.
// format: geojson | json (array/objekt) | rowstore (EntryScape rowstore, paginerad) | csv | zip-geojson
export const LEK = [
  { id: 'malmo', kommun: 'Malmö', url: 'https://opendata-api.malmo.se/dataset/c08d7231-9b49-4af5-94bd-3bc6ed5cf7a2/resource/c18f001e-891c-42c6-86e2-f30b8749e26f/download/lekplatser.geojson', format: 'geojson', licens: 'CC0 1.0', dataset: 'https://dataportal.se (Malmö stad: Lekplatser)' },
  { id: 'sodertalje', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/lekplatser.json', format: 'json', licens: 'CC0 1.0' },
  { id: 'boras', kommun: 'Borås', url: 'https://catalog.boras.se/store/1/resource/74', format: 'json', licens: 'CC0 1.0' },
  { id: 'gavle', kommun: 'Gävle', url: 'https://catalog.gavle.se/store/1/resource/83', format: 'zip-geojson', licens: 'CC0 1.0' },
  { id: 'vara', kommun: 'Vara', url: 'https://catalog.vara.se/rowstore/dataset/2d0adb30-6c72-41ff-a4b9-ff56e7ffabb6', format: 'rowstore', licens: 'CC0 1.0' },
  { id: 'botkyrka', kommun: 'Botkyrka', url: 'https://data.botkyrka.se/store/3/resource/173', format: 'json', licens: 'CC0 1.0' },
  { id: 'stenungsund', kommun: 'Stenungsund', url: 'https://catalog.stenungsund.se/rowstore/dataset/fc6ad312-1a22-4fa3-88c0-de26daf66cc4', format: 'rowstore', licens: 'CC0 1.0' },
  { id: 'skovde', kommun: 'Skövde', url: 'https://karta.skovde.se/linkdokument/OpenData/lekplatser.json', format: 'json', licens: 'CC0 1.0' },
  { id: 'kungsbacka', kommun: 'Kungsbacka', url: 'https://kungsbacka.entryscape.net/store/1/resource/188', format: 'csv', licens: 'CC0 1.0' },
  { id: 'eslov', kommun: 'Eslöv', url: 'https://catalog.eslov.se/rowstore/dataset/08b5e92d-7bc7-41de-aa56-f67f6662e919', format: 'rowstore', licens: 'CC0 1.0' },
  { id: 'lomma', kommun: 'Lomma', url: 'https://catalog.lomma.se/store/1/resource/52', format: 'json', licens: 'CC0 1.0' },
  { id: 'lomma-utrustning', kommun: 'Lomma', url: 'https://catalog.lomma.se/store/1/resource/228', format: 'json', licens: 'CC0 1.0', roll: 'utrustning' },
  { id: 'falun', kommun: 'Falun', url: 'https://falun.entryscape.net/rowstore/dataset/6a94dfdb-751a-47f3-94d2-3242aca049c2', format: 'rowstore', licens: 'CC0 1.0' },
  { id: 'karlstad', kommun: 'Karlstad', url: 'https://gi.karlstad.se/geoserver/oppnadata/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=oppnadata%3Akarlstad_lekplatser&outputFormat=application%2Fjson', format: 'geojson', licens: 'CC0 1.0' },
  { id: 'ystad', kommun: 'Ystad', url: 'https://ystad.entryscape.net/store/1/resource/39', format: 'json', licens: 'CC0 1.0' },
  { id: 'tomelilla', kommun: 'Tomelilla', url: 'https://data.tomelilla.se/rowstore/dataset/6f5ff23b-0e05-4746-a37d-ad2dad3ada29', format: 'rowstore', licens: 'ej angiven' },
  { id: 'bastad', kommun: 'Båstad', url: 'https://geodata.bastad.se/maps/Oppen_data/Lekplatser_4_0_databas/data.json', format: 'geojson', licens: 'ej angiven' },
  { id: 'engelholm', kommun: 'Ängelholm', url: 'https://geodata.engelholm.se/maps/oppen_data/geodirekt_4_lekplatser/data.json', format: 'geojson', licens: 'ej angiven' },
  { id: 'harryda', kommun: 'Härryda', url: 'https://catalog.harryda.se/rowstore/dataset/977bd7e6-a7a1-48c1-8392-bc5897772ac9', format: 'rowstore', licens: 'ej angiven' },
  { id: 'kungalv', kommun: 'Kungälv', url: 'https://catalog.kungalv.se/rowstore/dataset/eaf573d8-94ff-4d89-8286-474f5deb9fda', format: 'rowstore', licens: 'ej angiven' },
  { id: 'oxelosund', kommun: 'Oxelösund', url: 'https://geodok.oxelosund.se/oppna_data/Lekplatser_oxelosund.csv', format: 'csv', licens: 'ej angiven' },
  { id: 'trelleborg', kommun: 'Trelleborg', url: 'https://catalog.trelleborg.se/store/2/resource/12', format: 'json', licens: 'ej angiven' },
];

export const PARK = [
  { id: 'sodertalje-parkeringshus', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/parkeringshus.json', format: 'json', licens: 'CC0 1.0', typ: 'parkeringshus' },
  { id: 'sodertalje-stora', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/stora_parkeringar.json', format: 'json', licens: 'CC0 1.0' },
  { id: 'sodertalje-infart', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/infartsparkeringar.json', format: 'json', licens: 'CC0 1.0', typ: 'pendlarparkering' },
  { id: 'sodertalje-husbil', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/husbilsparkering.json', format: 'json', licens: 'CC0 1.0', typ: 'husbilsparkering' },
  { id: 'sodertalje-motion', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/parkering_vid_motionsspar.json', format: 'json', licens: 'CC0 1.0', typ: 'friluftsparkering' },
  { id: 'sodertalje-friluft', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/parkering_friluftsliv.json', format: 'json', licens: 'CC0 1.0', typ: 'friluftsparkering' },
  { id: 'gavle-zoner', kommun: 'Gävle', url: 'https://catalog.gavle.se/store/1/resource/115', format: 'zip-geojson', licens: 'CC0 1.0', roll: 'avgiftszoner' },
  { id: 'skovde', kommun: 'Skövde', url: 'https://karta.skovde.se/linkdokument/OpenData/parkeringsplats.json', format: 'json', licens: 'CC0 1.0' },
  { id: 'lidingo-infart', kommun: 'Lidingö', url: 'https://metadata.lidingo.se/store/9/resource/12', format: 'csv', licens: 'CC0 1.0', typ: 'pendlarparkering' },
  { id: 'harryda', kommun: 'Härryda', url: 'https://catalog.harryda.se/rowstore/dataset/db6fa782-cad3-46c5-aa2b-c38254a53bf2', format: 'rowstore', licens: 'CC0 1.0' },
  { id: 'tjorn', kommun: 'Tjörn', url: 'https://catalog.tjorn.se/store/1/resource/23', format: 'csv', licens: 'CC0 1.0' },
  { id: 'mariestad', kommun: 'Mariestad', url: 'https://catalog.mariestad.se/store/1/resource/17', format: 'json', licens: 'CC0 1.0' },
  { id: 'toreboda', kommun: 'Töreboda', url: 'https://catalog.toreboda.se/store/1/resource/15', format: 'json', licens: 'CC0 1.0' },
  { id: 'gullspang', kommun: 'Gullspång', url: 'https://catalog.gullspang.se/store/1/resource/17', format: 'json', licens: 'CC0 1.0' },
  { id: 'haninge-infart', kommun: 'Haninge', url: 'https://haninge.entryscape.net/rowstore/dataset/a4a2e2ca-2fbb-4288-9644-37589346c742', format: 'rowstore', licens: 'ej angiven', typ: 'pendlarparkering' },
  // Zoner/punkter som berikar befintliga anläggningar (laddplatser, avgiftszoner) i stället för att bli egna objekt:
  { id: 'helsingborg-laddplatser', kommun: 'Helsingborg', url: 'https://oppnadata.helsingborg.se/sbf/transport/parkeringsplatser_ovriga/laddpl.geojson', format: 'geojson', licens: 'CC BY 4.0', roll: 'laddplatser' },
  { id: 'helsingborg-rorelsehindrade', kommun: 'Helsingborg', url: 'https://oppnadata.helsingborg.se/sbf/transport/parkeringsplatser_ovriga/rorelseh.geojson', format: 'geojson', licens: 'CC BY 4.0', roll: 'handikapplatser' },
  { id: 'malmo-avgifter', kommun: 'Malmö', url: 'https://opendata-api.malmo.se/dataset/c06939a6-65b4-4078-9cb5-b49aa48b9140/resource/1a6bd68b-30ca-40a5-9d62-01e2a566982e/download/parkeringsavgifter.geojson', format: 'geojson', licens: 'CC0 1.0', roll: 'avgiftslinjer' },
  { id: 'stockholm-ltf', kommun: 'Stockholm', url: 'https://openparking.stockholm.se/LTF-Tolken/v1/ptillaten/all?outputFormat=json', format: 'ltf', skript: '06-fetch-stockholm-ltf.mjs', licens: 'licensfritt', not: 'Stockholms stad: "får vidareutnyttjas fritt och tillhandahållas licensfritt om inget annat anges" (openstreetgs.stockholm.se). Ingen API-nyckel krävs för LTF-Tolken.', roll: 'avgiftslinjer' },
  { id: 'sodertalje-betalzoner', kommun: 'Södertälje', url: 'https://static-content.sodertalje.se/opendata/betalparkeringszoner.json', format: 'json', licens: 'CC0 1.0', roll: 'avgiftszoner' },
];

// ArcGIS REST-tjänster (hittade via hub.arcgis.com, 03-discover-arcgis.mjs). lager: regex mot lagernamn,
// eller exakt lager-URL (…/MapServer/44). Licens enligt ArcGIS-objektets licenseInfo (kontrollerad 2026-11-19).
export const ARCGIS = [
  // lekplatser
  { tema: 'lek', id: 'vasteras', kommun: 'Västerås', url: 'https://services-eu1.arcgis.com/lyiwM2rVk68OQ7Fd/arcgis/rest/services/Kommunala_lekplatser/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  { tema: 'lek', id: 'uppsala', kommun: 'Uppsala', url: 'https://services.arcgis.com/hrh7HJqpzvUrwY6X/arcgis/rest/services/Lekplatser_uppsala/FeatureServer', lager: /.*/, licens: 'CC BY', not: 'Uppsala kommuns lekplatsdata publicerad av Esri Sverige (2015), kan vara inaktuell' },
  { tema: 'lek', id: 'lulea', kommun: 'Luleå', url: 'https://services.arcgis.com/f1FD2L08bel8cfME/arcgis/rest/services/lekplatser/FeatureServer', lager: /.*/, licens: 'CC BY', not: 'Attribution: Geodataproducent: Luleå kommun' },
  { tema: 'lek', id: 'skelleftea', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Park_och_natur_ext/FeatureServer', lager: /^Lekplatser$/, licens: 'CC BY 4.0' },
  { tema: 'lek', id: 'skelleftea-utrustning', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Park_och_natur_ext/FeatureServer', lager: /^Lekutrustning$/, licens: 'CC BY 4.0', roll: 'utrustning' },
  { tema: 'lek', id: 'gotland', kommun: 'Gotland', url: 'https://kartor.gotland.se/arcgis/rest/services/Park/oppnadata_lekplatser_p/FeatureServer', lager: /.*/, licens: 'ej angiven', not: 'publicerad som öppna data' },
  { tema: 'lek', id: 'varberg', kommun: 'Varberg', url: 'https://services3.arcgis.com/rusrCBFktCNPtUy3/arcgis/rest/services/Kommunala_lekplatser_vy_typ/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  { tema: 'lek', id: 'vellinge', kommun: 'Vellinge', url: 'https://services3.arcgis.com/V1E24miEW9adAZYb/arcgis/rest/services/Lekplatser_oppnadata/FeatureServer', lager: /.*/, licens: 'ej angiven', not: 'publicerad som öppna data' },
  { tema: 'lek', id: 'borlange', kommun: 'Borlänge', url: 'https://services-eu1.arcgis.com/k9fhBrx5QiIxrnsD/arcgis/rest/services/Lekplatser_punkter/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  { tema: 'lek', id: 'sater', kommun: 'Säter', url: 'https://services-eu1.arcgis.com/Edg0lenBBoWlakRf/arcgis/rest/services/Lekplatser/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  { tema: 'lek', id: 'hallstahammar', kommun: 'Hallstahammar', url: 'https://services-eu1.arcgis.com/vkGU9ZuRu3qDJH0t/arcgis/rest/services/Lekplats/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  // parkering
  { tema: 'park', id: 'jonkoping-ytor', kommun: 'Jönköping', url: 'https://gis.jonkoping.se/arcgis/rest/services/OpenData/MapServer/44', licens: 'CC BY', not: 'Ange Jönköpings kommun som källa' },
  { tema: 'park', id: 'jonkoping-kff', kommun: 'Jönköping', url: 'https://gis.jonkoping.se/arcgis/rest/services/open_data_digg/MapServer/43', licens: 'CC0 1.0', typ: 'friluftsparkering' },
  { tema: 'park', id: 'lulea-phus', kommun: 'Luleå', url: 'https://services.arcgis.com/f1FD2L08bel8cfME/arcgis/rest/services/Parkeringshus/FeatureServer', lager: /.*/, licens: 'CC BY', not: 'Attribution: Geodataproducent: Luleå kommun', typ: 'parkeringshus' },
  { tema: 'park', id: 'lulea-taxa', kommun: 'Luleå', url: 'https://services.arcgis.com/f1FD2L08bel8cfME/arcgis/rest/services/Parkeringstaxa/FeatureServer', lager: /.*/, licens: 'CC BY', not: 'Attribution: Geodataproducent: Luleå kommun', roll: 'avgiftszoner' },
  { tema: 'park', id: 'skelleftea-phus', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Trafik_och_parkering_ext/FeatureServer', lager: /^Parkeringshus$/, licens: 'CC BY 4.0', typ: 'parkeringshus' },
  { tema: 'park', id: 'skelleftea-pendlar', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Trafik_och_parkering_ext/FeatureServer', lager: /^Pendlarparkering$/, licens: 'CC BY 4.0', typ: 'pendlarparkering' },
  { tema: 'park', id: 'skelleftea-ytor', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Trafik_och_parkering_ext/FeatureServer', lager: /^Parkeringsytor bil$/, licens: 'CC BY 4.0' },
  { tema: 'park', id: 'skelleftea-taxa', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Trafik_och_parkering_ext/FeatureServer', lager: /^Taxa$/, licens: 'CC BY 4.0', roll: 'avgiftszoner' },
  { tema: 'park', id: 'skelleftea-ladd', kommun: 'Skellefteå', url: 'https://gis.skelleftea.se/arcgis2/rest/services/Gata_park/SKE_Trafik_och_parkering_ext/FeatureServer', lager: /^Parkeringsrutor laddplats$/, licens: 'CC BY 4.0', roll: 'laddplatser' },
  { tema: 'park', id: 'vaxjo', kommun: 'Växjö', url: 'https://services5.arcgis.com/WJV4fyJf1eDrDMiY/arcgis/rest/services/Parkeringskartan_1_0_WFL1_1_View_Layer/FeatureServer/17', licens: 'CC BY', not: 'Ange Växjö kommun som källa' },
  { tema: 'park', id: 'simrishamn', kommun: 'Simrishamn', url: 'https://services9.arcgis.com/NkmmUTvsR98rrIbx/arcgis/rest/services/Parkeringsplatser/FeatureServer', lager: /.*/, licens: 'ej angiven' },
  { tema: 'park', id: 'orust', kommun: 'Orust', url: 'https://services2.arcgis.com/1Nvz85KbF7OLwYjb/arcgis/rest/services/Parkering_2020/FeatureServer', lager: /.*/, licens: 'ej angiven' },
];
