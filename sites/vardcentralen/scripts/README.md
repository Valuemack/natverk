# vårdcentralen.nu – datainsamling

Bygger `data/enheter.json`: alla vårdcentraler i Sverige (offentliga och privata inom
vårdvalet), inklusive hälsocentraler, husläkarmottagningar och filialer. Skripten använder
bara Node 24 (inbyggd `fetch`) och har inga npm-beroenden.

## Köra

Kör från `sites/vardcentralen` (sökvägen har mellanslag och "ö", så citera den):

```sh
cd "<sökväg>/natverk/sites/vardcentralen"
node scripts/run-all.mjs            # allt, ca 25–30 min (1 anrop/s mot 1177.se)
node scripts/run-all.mjs --offline  # bygg om från befintlig rådata, ca 10 s
```

Du kan också köra stegen ett i taget:

| Steg | Skript | Vad det gör | Tid |
|---|---|---|---|
| 1 | `01-fetch-oppna-data.mjs` | Hämtar Vårdbetygs register (CC BY 4.0) och VGR:s vårdcentraler (CC0) | 2 s |
| 2 | `02-fetch-1177-lista.mjs` | Hämtar 1177 Hitta vård-listorna för vårdtyperna Vårdcentral, Närakut och Jourmottagning | 20 s |
| 3 | `03-fetch-1177-kort.mjs` | Hämtar ett kontaktkort per enhet (öppettider, drop-in, ägarform, webb). Cache finns i `data/raw/1177-kort/` | ca 24 min |
| 4 | `04-fetch-kommungranser.mjs` | Hämtar SCB:s kommungränser (CC0). `run-all` kör steget högst var 30:e dag | 2 s |
| 5 | `05-fetch-osm.mjs` | Hämtar OpenStreetMap via Overpass (ODbL) och provar flera speglar. `run-all` kör steget högst var 7:e dag | 1–5 min |
| 10 | `10-build.mjs` | Slår ihop allt och skriver utdata. Gör inga nätverksanrop | 10 s |

Steg 3 har två flaggor. `--max-age-h=20` är standard: kort äldre än 20 timmar hämtas om,
så en nattlig körning förnyar alla. `--limit=N` hämtar högst N kort och är till för test.

### Nattlig körning (Windows Schemaläggaren)

```
Program:   C:\Program Files\nodejs\node.exe
Argument:  "<sökväg>\natverk\sites\vardcentralen\scripts\run-all.mjs"
```

Exitkoderna betyder:

- `0`: allt gick bra.
- `2`: något hämtningssteg misslyckades. Bygget gjordes ändå, med den senaste rådata som lyckades.
- `1`: bygget misslyckades.

Skydd mot dålig data:

- Ett hämtningssteg skriver aldrig över rådata med en uppenbart ofullständig hämtning. Det
  gäller till exempel 1177-listan när färre än 98 % av träffarna kom med, och CSV-filer
  under minsta antal rader.
- Bygget vägrar skriva `enheter.json` om det får fram färre än 1000 enheter.

## Utdata

| Fil | Innehåll |
|---|---|
| `data/enheter.json` | En post per enhet enligt det gemensamma schemat (se nedan) |
| `data/kommuner.json` | Kommunerna med antal enheter och orter, till kommun- och ortsidor |
| `data/rapport.json` | Täckning i procent, fördelning per län, kedjor och typer, QA-räknare |
| `data/qa.json` | Detaljer för kvalitetsgranskning: uteslutna enheter, kommunkonflikter, Vårdbetyg-rader utan 1177-match, delade koordinater |
| `data/id-map.json` | Mappningen HSA-id → `id`. Den gör att `id` (och därmed sidans URL) inte ändras när en enhet byter namn. Checka in filen och radera den inte |
| `data/raw/` | Rådata och cache. Kan raderas, men då tar nästa körning längre tid |

### Schema (`enheter.json`)

```
{ id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb,
  oppettider: { mon..sun: "08:00-17:00" | "08:00-12:00,13:00-17:00" | "stängt" | null },
  extra: { dropin, narakut, jourmottagning, filial, huvudman, vardgivare, hsa_id, url_1177, ... },
  kallor: [ ... ], uppdaterad: "YYYY-MM-DD" }
```

- **`id`** är en slug av namnet, till exempel `abrahamsbergs-vardcentral`. Den tilldelas en gång per HSA-id och lagras sedan i `id-map.json`.
- **`typ`** är den lokala benämningen: `vårdcentral`, `hälsocentral`, `husläkarmottagning`, `läkarhus`, `familjeläkarmottagning`, `filial`, `närmottagning`, `distriktssköterskemottagning` eller `sjukstuga`. Typen tas från namnet. När namnet inte avgör används `hälsocentral` i Norrlandslänen 22–25 och `vårdcentral` i övriga län.
- **`kedja`** är kedjan eller operatören. Den sätts i den här ordningen:
  1. Ett känt varumärke i namnet, i Vårdbetygs kedjefält, i VGR:s företagsfält eller i 1177:s text om vem som driver enheten. Exempel är Capio, Kry, Praktikertjänst, Meliva, Närhälsan och Bra Liv.
  2. Om enheten drivs av regionen: regionens namn, till exempel `Region Skåne`.
  3. Annars namnet på det privata bolaget som driver enheten.
  4. Annars `null`.
- **`oppettider`** är besöksöppettider från 1177/HSA, med kolon i tiderna.
  - Korta stängningar, som `Lunchstängt 12–13`, dras bort, så en dag kan ha flera intervall separerade med komma.
  - Intervall som bara gäller lab, provtagning eller vaccination tas bort om det finns andra intervall samma dag.
  - `null` betyder att uppgiften saknas.
- **`extra.dropin`** kommer i första hand från 1177:s strukturerade drop-in-schema och i andra hand från kommentarer i öppettiderna, som "Drop in", "Öppen mottagning" eller "Lättakut".
  - `true` betyder att det finns drop-in-tider (de står i `extra.dropin_tider`).
  - `false` betyder att schemat säger "Ingen drop-in", eller att texten säger att enheten inte har drop-in.
  - `null` betyder att uppgiften saknas.
  - Om drop-in bara gäller provtagning blir `dropin` `false` och `dropin_endast_provtagning` blir `true`.
- **`extra.narakut`** och **`extra.jourmottagning`** är `true` när enheten själv finns med under vårdtypen Närakut eller Jourmottagning på 1177. Annars är de `null`, inte `false`.
- **`extra.huvudman`** är `region` eller `privat`. Uppgiften tas från 1177:s ägarform, i andra hand från Vårdbetyg och sist från VGR.
- **`kommun`** och **`lan`**: se nästa avsnitt. **`ort`** är besöksadressens ort och i andra hand postorten.
- **`kallor`** är en lista med namnen på källorna som bidragit till posten.

### Hur kommun bestäms

Kommunen bestäms med **punkt-i-polygon** på SCB:s digitala kommungränser (CC0, SWEREF 99 TM).
1177:s WGS84-koordinater räknas om till SWEREF 99 TM med Lantmäteriets Gauss–Krüger-formler,
som finns i `lib.mjs`.

SCB:s gränser är förenklade, så en enhet nära en kommungräns kan hamna fel. Resultatet jämförs
därför med HSA-kommunen (1177:s fält `Municipality`) och med Vårdbetygs kommunkod:

- Om majoriteten säger en annan kommun, eller om punkten ligger inom 3 km från den kommun som
  HSA anger, används HSA-kommunen.
- Om punkten ligger utanför alla polygoner, till exempel vid kusten, används den närmaste
  kommunen.

Vilken metod som användes står i `extra.kommun_metod`. Konflikter loggas i `qa.json`. Länet
härleds från kommunkodens två första siffror.

## Källor, licenser och villkor

| Källa | Används till | Licens och villkor |
|---|---|---|
| **1177.se Hitta vård** (Inera, uppgifter ur HSA-katalogen) | Huvudkälla: alla enheter, adress, koordinat, telefon, öppettider, drop-in, ägarform och webb | Se nedan |
| **Vårdbetyg** (`vardbetyg.se/data/vardcentraler.csv`) | Kontroll mot registret, huvudman, kedja, vårdgivare och kommunkod | **CC BY 4.0**. Ange "Vårdbetyg (vardbetyg.se), CC BY 4.0". robots.txt tillåter `/data/` |
| **Västra Götalandsregionen**, Vårdcentraler i Vårdval vårdcentral (via dataportal.se) | Företag/operatör, postnummer och koordinatkontroll i VGR | **CC0** |
| **SCB** digitala gränser | Kommungränser | **CC0** |
| **OpenStreetMap** via Overpass | Bara reserv för koordinat eller webbplats när 1177 saknar den | **ODbL 1.0**. Ange "© OpenStreetMap-bidragsgivare" på sajten |

Om 1177.se:

- **API:** Det finns inget öppet API. Inera erbjuder API-nyckel bara till regioner.
- **robots.txt:** Tillåter `/hitta-vard/`. Kontaktkorten finns dessutom i `healthunitsitemap.xml`.
- **Villkor:** Sidan "Om 1177.se" säger att innehållet får användas med vissa begränsningar, att det går bra att ange 1177 som källa och att bilder och logotyp inte får användas.
- **Vad vi använder:** Bara faktauppgifter ur HSA-katalogen. Inga texter, bilder eller logotyper kopieras.
- **Hur vi hämtar:** Högst 1 anrop per sekund, med en generisk User-Agent och utan inloggning. Inga skydd kringgås.
- **Risk:** Att systematiskt ta ut en stor del av en katalog kan beröra katalogskyddet i 49 § upphovsrättslagen. Vi tar knappt 1 300 av drygt 17 000 kontaktkort och bara faktafält. Överväg ändå att be Inera om lov eller ange 1177 som källa med länk per enhet. Länken finns i `extra.url_1177`.

**Utvärderade men inte använda:**

- **Kedjornas egna listor** (Capio, Praktikertjänst, Kry, Aleris, Doktor.se, Meliva): robots.txt tillåter dem, men listorna renderas med JavaScript eller interna API:er. Kedjan går ändå att härleda från 1177:s text om vem som driver enheten, från Vårdbetyg och från VGR, så de skrapas inte.
- **Region Blekinges** öppna datamängd "Vårdcentraler": värden `oppnadata.regionblekinge.se` gick inte att slå upp i DNS den 2026-11-19.
- **Overpass-speglar:**
  - `overpass-api.de` svarar 406 om User-Agent innehåller "Mozilla" eller "crawler".
  - `maps.mail.ru` och `overpass.private.coffee` svarade 504.
  - `overpass.kumi.systems` fungerade.
