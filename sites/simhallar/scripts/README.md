# simhallar.se – datapipeline

Node 24, inga beroenden. Kör från `natverk/sites/simhallar/`.

## Steg

| Skript | Gör | Nätverk |
|---|---|---|
| `01-kommun-sites.mjs` | Kommunernas webbplatser från Wikidata (P525/P856) -> `data/raw/kommun-sites.json` | ja (1 anrop) |
| `02-crawl.mjs` | Fokuserad crawl per kommun: sitemap, navigation, sök-URL:er, länkade anläggnings-/operatörssajter + Medley och Actic. Sparar fakta-text, JSON-LD och länkar per sida i `data/raw/pages/<kommunkod>.json` | ja |
| `03-extract.mjs` | Offline: sidor -> anläggningar med öppettider (per del), priser, bassänger, faciliteter, adress, telefon, avvikelser -> `data/raw/facilities.json` | nej |
| `10-build.mjs` | Matchar mot OSM (`../osm-data/data/simhallar.json`, endast läsning), skapar nya poster från webben, stabila id/slugs -> `data/simhallar.json`, `data/kommuner.json`, `data/rapport.json` | nej |
| `run-all.mjs` | Hela kedjan med retry och skydd mot försämrat resultat | ja |

```
node scripts/run-all.mjs                 # nattkörning (01 bara om filen är >7 dagar)
node scripts/run-all.mjs --offline       # bara 03 + 10 från cachade sidor
node scripts/run-all.mjs --only=0180,1480  # crawla om vissa kommuner, bygg sedan allt
node scripts/02-crawl.mjs --only=1280 --fresh --max=70 --conc=30
```

`02-crawl` återanvänder sidfiler yngre än 20 h (`--maxage=`), så en krasch + omstart fortsätter där den slutade. `--fresh` tvingar omhämtning.
`run-all` sparar föregående `simhallar.json` i `data/raw/simhallar.prev.json` och återställer den om bygget fallerar eller om antal poster sjunker >15 % eller antal med öppettider >30 %. Exit: 0 ok, 1 bygget stoppat, 2 crawlen fallerade (bygget gjordes på cache).

Windows Schemaläggaren (natt 03:15):
```
schtasks /Create /SC DAILY /ST 03:15 /TN simhallar-data /TR "cmd /c cd /d \"<sökväg>\natverk\sites\simhallar\" && node scripts\run-all.mjs >> data\raw\nightly.log 2>&1"
```

## Regler för hämtning (lib.mjs)

- robots.txt följs för User-Agent `dataset-builder` och `*`. En värd hoppas helt över om robots.txt blockerar AI-agenter (Disallow `/` för claude/anthropic, eller för minst två AI-crawlers). Crawl-delay följs upp till 10 s, värdar med längre delay hoppas över.
- Max 1 anrop/s per värd (1,1 s mellanrum, seriell kö per värd).
- CAPTCHA/botskydd (403/429/503 med utmaningstext) -> värden markeras blockerad, inga försök att ta sig förbi. Inga inloggningar.
- Generisk User-Agent: `dataset-builder/1.0 (open data compilation)`.
- Endast fakta sparas (tider, priser, mått, adresser, telefon). Inga löptexter eller bilder publiceras. Blockerade värdar listas i `data/raw/crawl-summary.json` och `data/rapport.json`.

## Utdata

`data/simhallar.json` – en post per anläggning:

```
{ id, namn, kedja, typ: "simhall"|"äventyrsbad"|"badhus"|"utomhusbad",
  gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb,
  oppettider: { mon..sun: "06:30-21:00,..." | "stängt" } | null,
  extra: {
    kommunkod, osm_id, slug,
    oppettider_per_del: { motionsbad|aventyrsbad|varmbassang|relax|gym|reception|...: {mon..sun} },
    priser: { vuxen, barn, pensionar, student, familj, ... },   // kr, ordinarie engångsbiljett
    bassanger: [{ namn, langd_m, banor, temp_c }],
    faciliteter: { bastu, gym, rutschkana, hopptorn, babysim, varmbassang, aventyrsbad, barnbassang,
                   relax, utomhusbassang, simskola, vattengympa, cafe, tillganglighet, motionssim },  // true|null
    avvikande_tider, senast_kontrollerad, oppettider_kalla: "webb"|"osm", oppettider_etikett,
    tillfalligt_stangd, namn_osm, kalla_urls, koordinat_kalla, matchning
  },
  kallor: [...], uppdaterad }
```

- Id: OSM-poster behåller `osm-<typ>-<id>`, webbposter får `web-<kommunkod>-<slug>`. Slugs låses i `data/slugs.json` – radera inte filen i drift.
- `data/kommuner.json`: alla 290 kommuner med antal, antal med officiella uppgifter, webbplats, crawlstatus och hallar.
- `data/rapport.json`: statistik, matchningar, OSM-poster som exkluderats/slagits ihop, nya poster från webben, omatchade anläggningar, varningar, blockerade värdar.

Matchning: avstånd <200 m, namn (kärnord), webbadress, gatuadress; officiella fakta vinner över OSM. Kommun/län från OSM eller punkt-i-polygon mot SCB:s kommungränser (`data/raw/scb-kommuner.json`).

Kända begränsningar: sajter som renderar navigation/tider med JavaScript (t.ex. Göteborg, Norrköping, Jönköping, Skellefteå) ger inga webbfakta; där finns OSM-basposten kvar. Geokodning saknas (Nominatim/Photon förbjuder /search i robots.txt), så några webbposter saknar koordinater.
