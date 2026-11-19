# parkering-lek – berikning av parkeringar.json och lekplatser.json

Berikar OSM-dataseten i `../osm-data/data/` (läses, ändras aldrig) med kommunala öppna data och
operatörernas publika anläggningssidor. Resultatet skrivs till `../data/` i samma schema som osm-data.
Node 18+ (testat på Node 24), inga beroenden.

## Köra

```
node scripts/run-all.mjs                 # hämta (med cache) + bygg + licensfil
node scripts/run-all.mjs --discover      # kör även katalogsökningar (dataportal.se + ArcGIS Hub, ~10 min)
node scripts/run-all.mjs --no-operators  # hoppa över operatörssidorna (Aimo ~65 min vid tom cache)
node scripts/run-all.mjs --build-only    # bygg bara om från befintlig rådata (~1 min)
FORCE=1 node scripts/run-all.mjs         # ignorera cache och hämta om allt
UTAN_OPERATORER=1 node scripts/10-build.mjs   # bygg utan operatörsdata (se databasrätt i LICENS-OCH-KALLOR.txt)
```

Stora byggen kan behöva `node --max-old-space-size=4096` (run-all sätter det själv).

## Steg

| Skript | Gör | Skriver |
|---|---|---|
| 00-kommungranser.mjs | Kommungränser (SCB, kopierade från ../vardcentralen) + kommun→län från osm-data | data/raw/scb-kommuner.json, kommun-lan.json |
| 01-discover-dataportal.mjs | Söker dataportal.se (EntryScape) efter "lekplats"/"parkering" | data/raw/katalog-lek.json, katalog-park.json |
| 02-fetch-kommun.mjs | Hämtar källorna i `sources.mjs` (LEK, PARK): GeoJSON, CSV, rowstore, shp | data/raw/kommun/<tema>-<id>.json, kommun-status.json |
| 03-discover-arcgis.mjs | Söker ArcGIS Hub efter kommunala lager (Crawl-delay 60 respekteras) | data/raw/katalog-arcgis.json |
| 04-fetch-arcgis.mjs | Hämtar ARCGIS-källorna (FeatureServer/MapServer, paginerat, outSR=4326) | data/raw/kommun/ |
| 05-fetch-operatorer.mjs | Stockholm Parkering, Aimo Park, APCOA via deras sitemap.xml; bara fakta | data/raw/operatorer/, operator-<op>.json |
| 06-fetch-stockholm-ltf.mjs | Stockholms stad LTF-Tolken, gatuparkeringens taxor (ingen nyckel) | data/raw/kommun/park-stockholm-ltf.json |
| 10-build.mjs | Matchar mot OSM, slår ihop, sätter id/slug, kommun/län | data/lekplatser.json, parkeringar.json, slugs.json, id-map.json, kommuner-lekplatser.json, rapport.json |
| 20-licens.mjs | Genererar licens-/källförteckningen från sources.mjs + status | data/LICENS-OCH-KALLOR.txt |

Hjälpmoduler: `lib.mjs` (artig fetch, robots.txt, CSV/zip/shp, geometri), `geo.mjs` (SWEREF99 TM och
lokala zoner 3007–3018, GeoJSON/esri/WKT/WKB → punkter, kommun via point-in-polygon), `html.mjs`,
`normalize.mjs` (fältmappning per källa, utrustningsord, taxatolkning), `sources.mjs` (källistan med licenser).

## Regler i koden

- robots.txt kontrolleras för varje URL, för "*" och AI-/dataset-agenter (ClaudeBot, anthropic-ai, GPTBot,
  CCBot, Google-Extended m.fl.). Disallow ⇒ `BlockedError`, källan hoppas över. Crawl-delay respekteras.
- Max 1 anrop/s per värd (1,1 s), generisk User-Agent `dataset-builder/1.0 (open data compilation)`.
- 401/403/CAPTCHA-sidor ⇒ blockerad. Ingen inloggning, registrering eller API-nyckel används.
- Fritext (`beskrivning`, `anmarkning`) tas bara med om källans licens är CC0/CC BY (inte NC/ND/"ej angiven").

## Sammanslagning

- Officiella poster matchas mot OSM med rutnätsindex, en-till-en, närmast först:
  lekplatser ≤ 60 m, eller ≤ 150 m med namnlikhet ≥ 0,6; parkeringar ≤ 60 m, eller ≤ 200 m med namnlikhet ≥ 0,6.
  Är båda namnen satta men olika krävs ≤ 20 m.
- Officiella värden vinner över OSM (operatör > kommun > OSM för parkering). Matchade poster behåller OSM-id;
  nya får `lek-<källa>-<källid|hash>` / `park-<källa>-<källid|hash>` (sparas i data/id-map.json).
- Slugs sparas i data/slugs.json och återanvänds vid nästa körning (stabila URL:er).
- Kommun/län: från osm-data för matchade poster, annars point-in-polygon mot SCB:s kommungränser.
- Lekplatser: utrustningspunkter (Lomma, Skellefteå) kopplas till närmaste lekplats inom 40 m.
  `extra.kommun_har_officiell_data` och data/kommuner-lekplatser.json visar vilka kommuner som har officiell data.
- Parkering: kommunala taxezoner/avgiftslinjer (Gävle, Södertälje, Luleå, Skellefteå, Malmö, Stockholm LTF)
  läggs som `extra.taxezon_kommun` (gatumarkens taxa i området, inte anläggningens egen taxa).
  Laddplatser/platser för rörelsehindrade (Helsingborg) summeras inom 60 m. Flygplatsparkeringar
  (inom 3 km från flygplats) får `typ: flygplatsparkering`, `extra.flygplats` och länk till swedavia.se.

## Schema (utöver osm-data)

Toppnivå: `id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb,
oppettider, extra, kallor, uppdaterad, slug`.

- Parkering `extra`: `kapacitet, avgift (bool), taxa, taxa_per_timme, max_tid, hojdbegransning, laddplatser,
  handikapplatser, zonkod, taxezon_kommun {namn, taxa, kalla}, flygplats, officiella_kallor[], matchning`.
- Lekplats `extra`: `utrustning[], tema, alder, tillganglighet, toalett, inhagnad, beskrivning (endast CC0/CC BY),
  storlek, belysning, underlag, senast_renoverad, officiell_kalla, officiell_licens, kommun_har_officiell_data, matchning`.

## Lägga till en källa

Lägg en rad i `sources.mjs` (LEK/PARK för filer, ARCGIS för REST-lager) med `id, kommun, url, format, licens`
och vid behov `roll` (laddplatser, handikapplatser, avgiftszoner, avgiftslinjer, utrustning). Källspecifik
fälttolkning läggs i `parkSpecial()`/`lekFromProps()` i `normalize.mjs`. Kör sedan `run-all.mjs`.
