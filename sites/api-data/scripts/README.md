# api-data: skript

Skripten använder bara Node 18+ (inbyggd `fetch`, ESM) och har inga beroenden. Alla anrop går med högst 2 per
sekund, med en generisk User-Agent, och görs om vid 429/5xx. Utdata skrivs atomärt (först `.tmp`, sedan rename).

Kör från mappen `api-data` (sökvägen innehåller mellanslag och "ö", så citera den):

```bash
cd "<sökväg>/natverk/sites/api-data"
```

## Badplatser (badstränder.se): varje natt

```bash
node scripts/hamta-badplatser.mjs                # ca 25 min, cirka 2 640 anrop mot HaV
node scripts/hamta-badplatser.mjs --limit 20     # snabbtest
node scripts/hamta-badplatser.mjs --spara-ra     # sparar även råsvar i data/raw/havbad-raw.json
node scripts/hamta-badplatser.mjs --utan-hav-sidor  # hoppar över sitemap-matchning (webb blir null)
node scripts/hamta-badplatser.mjs --ingen-cache     # ignorerar återupptagningscachen
```

En avbruten körning kan startas om. Svar sparas löpande i `data/raw/havbad-cache.ndjson` och återanvänds i
12 timmar (`--cache-timmar H`). HaV:s gateway svarar ibland långsamt (5–10 s per anrop vid 09-tiden), och därför
har varje anrop en timeout på 90 s och omförsök.

`badplatser.json` (cirka 14 MB, ett objekt per rad) innehåller alla provresultat som API:et ger (upp till 5 år,
i snitt 14 per plats). Fält utöver schemat: `kommunkod`, och i `extra` bland annat `klassificeringar` (4 år),
`badsasong`, `vattentemp.senast_uppmatt` och `vattentemp.prognos`, `avradan`, `blomningsrisk`, `huvudman`,
`beskrivning`/`sammanfattning` och `omkrets` (polygon för 457 platser).

Utdata: `data/badplatser.json` (gemensamt schema) och `data/badplatser-rapport.json` (statistik och fel).
Källa: HaV, API Badplatser och badvatten v2 (`https://gw.havochvatten.se/external-public/bathing-waters/v2`):
`/bathing-waters` (listan) och sedan `/bathing-waters/{id}` (samlad profil, provresultat och vattentemperaturprognos).
Fältet `webb` pekar på HaV:s egen sida om badplatsen. Den matchas på namn mot HaV:s sitemap och sätts bara när matchningen är entydig.

Rekommenderad frekvens: **varje natt (till exempel 03:15) under juni–augusti**. Prover läggs in löpande under säsongen,
och temperaturprognosen för kustbad uppdateras en gång per dygn. Utanför säsong räcker det med **en gång i veckan**.

## Pollen (pollenläget.se): flera gånger per dag i säsong

```bash
node scripts/hamta-pollen.mjs                              # cirka 6 anrop, några sekunder
node scripts/hamta-pollen.mjs --dagar 14                   # fler dagar med uppmätta halter
node scripts/hamta-pollen.mjs --sasongsexempel 2026-05-12  # arkivexempel -> data/pollen-exempel-sasong.json
```

Utdata: `data/pollen-regioner.json`, `pollen-typer.json`, `pollen-prognoser.json` och `pollen-matningar.json`. Se `data/pollen-README.md`.

Rekommenderad frekvens: **3–4 gånger per dag från februari till september** (t.ex. 07:30, 10:30, 14:00 och 18:00),
och **en gång per dygn från oktober till januari**. NRM ber användare att inte hämta samma data upprepade gånger, så tätare än en gång i timmen ska man inte hämta.

## Schemaläggning (Windows Task Scheduler, exempel)

```powershell
schtasks /Create /TN "api-data badplatser" /SC DAILY /ST 03:15 /TR "cmd /c cd /d \"<sökväg>\natverk\sites\api-data\" && node scripts\hamta-badplatser.mjs > data\badplatser.log 2>&1"
schtasks /Create /TN "api-data pollen" /SC HOURLY /MO 4 /ST 06:30 /TR "cmd /c cd /d \"<sökväg>\natverk\sites\api-data\" && node scripts\hamta-pollen.mjs > data\pollen.log 2>&1"
```

## Licenser i korthet

- **HaV** ("Avtal om användarvillkor för API:er för öppna data"): API-specifikationen är CC0. Datan lyder under "villkor i enlighet med vad som anges på HaV:s webplats", och där står "All data från HaV är öppen för att göras tillgänglig för vidareutnyttjande". Sajten får inte se ut att vara HaV:s egen, och HaV:s namn får bara användas som källhänvisning. Ingen nyckel krävs för badvatten-API:et.
- **Pollenrapporten/NRM**: prognoserna är CC BY-ND 4.0 (får inte ändras) och övriga öppna data CC BY-SA 4.0. Båda tillåter kommersiell användning med källhänvisningen "Palynologiska laboratoriet, Naturhistoriska riksmuseet".
