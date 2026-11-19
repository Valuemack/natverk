# bensinstationer.nu – datapipeline

Beroendefria Node-skript (Node 18+, testat på Node 24). Berikar OSM-datasetet
(`../osm-data/data/bensinstationer.json`, läses bara – ägs av osm-data-pipelinen) med fakta från
kedjornas publika stationssök och slår ihop allt till `data/stationer.json`.

## Köra

```sh
cd "<sökväg>/natverk/sites/bensinstationer"

node scripts/run-all.mjs              # allt: kedjor + listpriser + sammanslagning
node scripts/run-all.mjs --priser     # bara listpriser -> data/listpriser.json (3 anrop)
node scripts/run-all.mjs --merge      # bara sammanslagning (t.ex. direkt efter att osm-data körts)
node scripts/run-all.mjs circlek st1  # bara valda kedjor + sammanslagning

# stegvis
node scripts/fetch-kedjor.mjs [circlek okq8 preem st1 qstar gulf dinx]
node scripts/fetch-priser.mjs
node scripts/merge.mjs
```

Körtid: ca 1–2 min med varm cache. Kall cache (första körningen eller efter 6 dygn) ca 20 min, eftersom
Preem (≈500) och St1 (≈500) kräver en detaljsida per station med max 1 anrop/s. Detaljsidorna cachas i
`data/cache/preem/` och `data/cache/st1/` i 6 dygn (`DETAIL_MAX_AGE_H=144`).

### Schemaläggning (Windows)

Kör efter osm-data (03:30), så att sammanslagningen får färsk OSM-fil:

```powershell
schtasks /Create /SC DAILY /ST 04:30 /TN "bensinstationer nightly" /TR "cmd /c cd /d \"<sökväg>\natverk\sites\bensinstationer\" && node scripts\run-all.mjs >> data\run.log 2>&1"
# Listpriser flera gånger per dygn (kedjorna ändrar listpris ungefär dagligen, ofta förmiddag):
schtasks /Create /SC DAILY /ST 08:15 /RI 240 /DU 12:00 /TN "bensinstationer priser" /TR "cmd /c cd /d \"<sökväg>\natverk\sites\bensinstationer\" && node scripts\run-all.mjs --priser >> data\run.log 2>&1"
```

Prisjobbet gör 3 anrop (ett per domän) och rör inte `stationer.json`, eftersom inga kedjor publicerar pris per station.

## Källor

| Källa | Hur | Ger |
|---|---|---|
| Circle K (+ INGO, Circle K Truck) | `circlek.se/station-search` bäddar in alla stationer i `drupal-settings-json` (1 anrop) | adress, koord, telefon, öppettider för station/butik/pumpar, drivmedel, tjänster |
| OKQ8 (+ Tanka, IDS) | `okq8.se/hitta-station/` bäddar in alla stationer i `window.__APP_INIT_DATA__` (1 anrop) | adress, koord, typ, öppettider, drivmedel, tjänster, stationssida |
| Preem (+ Såifa, TRB, Gasum …) | Gatsby `page-data/stationer/page-data.json` + en `page-data.json` per station | adress, koord, typ, öppettider (bemannade), drivmedel, tjänster |
| St1 | Nuxt `__NUXT_DATA__` på `/hitta-station` + `/station/<slug>` | adress, ort, kommun, koord, öppettider, drivmedel, tjänster |
| Qstar (+ Bilisten, Pump) | publik JSON `qstar-backend-prod.herokuapp.com/api/v2/stations/qstar` (som kartan använder) | adress, koord, drivmedel |
| Gulf | markörer inbäddade på `gulfsverige.com/hitta-station/` | adress, koord, telefon, typ |
| Din-X | `din-x.se` – svarar inte (timeout) | – (OSM används) |
| Listpriser | OKQ8, Circle K och Preem publicerar företagslistpris inkl. moms | `data/listpriser.json` |

Regler i `lib.mjs` (`politeGet`): robots.txt läses per origin och följs, inklusive grupper för AI-crawlers
(ClaudeBot, anthropic-ai, GPTBot m.fl.), max 1 anrop/s per domän, generisk User-Agent, HTTP 403/429 eller
CAPTCHA/bot-skydd ger stopp för källan (ingen kringgång). Robots-status sparas i `data/raw/robots.json`.
En källa som fallerar behåller föregående `data/raw/<källa>.json` (status `fel`/`blockerad`), så sajten
tappar inte stationer om en kedja tillfälligt är nere.

## Sammanslagning (`merge.mjs`)

1. **Matchning** kedjepost ↔ OSM, girig 1:1 efter poäng:
   samma kedjefamilj inom 150 m (bonus om gatunamnet stämmer) → samma familj + samma gata inom 1 km →
   OSM utan varumärke inom 80 m → OSM med okänt/gammalt varumärke (JET, "Bensin" …) inom 40 m →
   **varumärkesbyte**: OSM säger kedja X, men X:s fullständiga stationslista har ingen station inom 300 m
   (då matchas närmaste andra kedjepost inom 120 m). Familjer: Circle K/INGO/Statoil, OKQ8/Tanka/IDS,
   Preem/Såifa, St1/Shell, Qstar/Bilisten/Pump, Gulf, Din-X.
2. **Fält**: kedjan vinner för adress, ort, postnummer, öppettider, typ och tjänster; OSM fyller luckor
   (webb, telefon, drivmedel, tjänster). Telefonnummer som delas av > 10 stationer är kundtjänst och flyttas
   till `extra.kundtjanst_telefon`.
3. **Kommun/län**: OSM:s kommun för matchade; punkt-i-polygon mot SCB:s kommungränser (`data/ref/`) för nya.
4. **Behålls**: omatchade kedjestationer (`extra.endast_kedja`) och OSM-stationer utan match
   (`extra.endast_osm`; `extra.ej_i_kedjans_stationslista` = OSM anger en kedja vars stationssök inte har
   stationen → troligen nedlagd eller bytt varumärke). OSM-dubbletter < 40 m från en kedjestation av samma
   familj tas bort.
5. **Stabila id och slugs**: `data/slugs.json` mappar `kalla:id` och `osm:<id>` → id och id → slug.
   Nya id: `circlek-21209`, `okq8-40065`, `preem-01071`, `st1-78183`, `qstar-1`, `gulf-1764`, OSM-poster
   behåller `osm-node-…`. En OSM-station som senare matchas mot en kedja behåller sitt id. Slug är unik inom kommunen.

## Utdata (`data/`)

| Fil | Innehåll |
|---|---|
| `stationer.json` | alla stationer, gemensamt schema (se nedan) |
| `listpriser.json` | kedjornas listpriser (företag, inkl. moms) + snitt för 95/98/diesel/HVO100/E85/biogas |
| `slugs.json` | id-/slug-register (checka in / spara – det är det som håller URL:erna stabila) |
| `rapport.json` | antal per kedja, täckning (adress/öppettider/telefon/priser), matchmetoder, källstatus |
| `LICENS-OCH-KALLOR.txt` | licenser, attribution och villkorsgenomgång |
| `raw/` | normaliserade kedjeposter per källa, `robots.json` |
| `cache/` | detaljsidor (Preem/St1), robots-ögonblicksbild 2026-11-19 |
| `ref/` | SCB-kommungränser (CC0) och kommun→län |

Schema per station:
`id, slug, namn ("Circle K Kungsgatan, Malmö"), kedja, typ ("bemannad" | "obemannad" | "truckstation" | null = okänt, bara OSM-poster),
gatuadress, postnummer ("123 45"), ort, kommun, lan, lat, lon, telefon, webb, oppettider {mon..sun: "HH:MM-HH:MM" | "stängt" | null} | null,
extra { drivmedel {bensin95, bensin98, diesel, hvo100, e85, biogas, el, adblue, (lng, alkylat, b100, …)}, tjanster {butik, biltvatt,
truckdiesel, laddning, adblue, toalett, mat, (gasol, slaputhyrning, biluthyrning, dusch, …)}, priser (alltid null – se nedan),
listpris_kedja ("OKQ8" | "Circle K" | "Preem" → nyckel in i listpriser.json), obemannad_dygnet_runt, oppettider_butik, oppettider_pumpar,
oppettider_kalla, kommunkod, kommun_metod, kalla_id, osm_id, matchning {metod, avstand_m}, endast_osm | endast_kedja, … }, kallor, uppdaterad`.

`oppettider` = butikens tider för bemannade stationer, annars pumparnas. `true`/`false`/`null` i drivmedel/tjänster
= finns / finns inte / okänt.

## Priser

Ingen kedja publicerar pumppris per station (Circle K och Preem skriver uttryckligen att aktuellt pris finns
på prisskylten), så `extra.priser` är `null`. För "dagens bensinpris" finns kedjornas listpriser i
`data/listpriser.json` – de ska presenteras som listpris/riktpris, inte som stationens pris.
bensinpriser.nu blockerar AI-crawlers i robots.txt och används inte. Se `data/LICENS-OCH-KALLOR.txt`.

## Underhåll

- Sidformat ändras: varje hämtare kastar fel vid för få poster, och föregående data behålls. Se `data/raw/<källa>.json -> status/fel`.
- Ny kedja: lägg en funktion i `fetch-kedjor.mjs` (returnera normaliserade poster via `base()`), lägg källan i `SOURCES`
  och familjen i `family()` i `merge.mjs`.
- Din-X: om `din-x.se` börjar svara loggar hämtaren det – skriv då en parser.
- Kommungränser: `data/ref/scb-kommuner.json` är kopierad från `vardcentralen/data/raw/` (SCB, CC0). Byt fil vid kommunreform.
