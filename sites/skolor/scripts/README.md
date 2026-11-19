# Skolor-data – förskolor.nu och komvux.nu

Node 24-skript utan beroenden (använder inbyggda `fetch`, `zlib` och `node:sqlite`). Skripten bygger de delade datafilerna i `../data/`.

## Köra

```bash
cd "<sökväg>/natverk/sites/skolor"
node scripts/run-all.mjs                # nattlig körning
node scripts/run-all.mjs --full         # hämta om allt: SER-detaljer, SCB-fil, OSM-rutor, kursräkning
node scripts/run-all.mjs --cache        # utveckling: återanvänd sparade råsvar i data/raw/ där de finns
node scripts/run-all.mjs --refresh-geo  # tvinga omhämtning av SCB-gränser (annars cache i 30 dagar)
```

Steg (körs i ordning av `run-all.mjs`, varje steg i en egen process):

| Skript | Skriver | Tid (normal natt) |
|---|---|---|
| `01-kommuner.mjs` | `data/kommuner.json` (290) | 2 s |
| `02-geo.mjs` | `data/raw/geo/` (SCB DeSO 2025 + tätorter 2023), cache 30 d | 0 s / 2 min |
| `03-kommunstatistik.mjs` | `data/kommunstatistik.json` | 10 s |
| `04-komvux.mjs` | `data/komvux.json`, `data/komvux_per_kommun.json` | ca 1 min inkrementellt; full (var 7:e dag automatiskt) ca 20 min; kursräkning var 6:e dag ca 8 min |
| `05-forskolor.mjs` | `data/forskolor.json`, `data/forskolor_tackning.json`, `data/raw/osm_omatchade_forskolor.json` | ca 30 s; OSM-rutor hämtas om var 6:e dag (10–60 min beroende på Overpass-last) |
| `06-validate.mjs` | `data/rapport.json`; avslutar med kod 1 vid schemafel | 2 s |

`run-all.mjs` avslutar med kod ≠ 0 om något steg fallerar. Alla utfiler skrivs atomiskt (`.tmp` + rename), så ett misslyckat steg lämnar förra versionen orörd. Logg: lägg `>> data/raw/nightly.log 2>&1` efter kommandot.

Windows Schemaläggaren (varje natt 03:30):

```powershell
schtasks /Create /SC DAILY /ST 03:30 /TN "skolor-data" /TR "cmd /c cd /d \"<sökväg>\natverk\sites\skolor\" && node scripts\run-all.mjs >> data\raw\nightly.log 2>&1"
```

## Hövlighet

- Högst 2 anrop/sekund och värd (≥ 550 ms mellanrum, `lib.mjs`), generisk User-Agent, exponentiell backoff.
- Skolenhetsregistret: listorna hämtas varje natt, detaljer bara för poster ändrade sedan förra körningen (`meta_modified_after`). Full omhämtning var 7:e dag.
- SCB-förskolefilen uppdateras en gång per år. Sidan kontrolleras högst var 7:e dag, och zip-länken hittas automatiskt även när årtalet i filnamnet byts.
- Overpass: Sverige hämtas som ett rutnät med 1°-rutor. En ruta som ger timeout delas i fyra (högst 3 nivåer). Uppdelningen kommer ihåg till nästa körning (`.split`-markörer). Varje ruta cachas i 6 dagar. Om en ruta inte går att hämta alls används rutans senaste data. Speglar: maps.mail.ru, overpass-api.de (kräver en icke-webbläsar-UA, annars svarar den 406), private.coffee, kumi.

## Schema (delas av flera sajter)

```
{ id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, kommunkod, lan, lat, lon,
  telefon, webb, epost, oppettider, extra: {...}, kallor: [{namn, url, licens}], uppdaterad }
```

- `id`: komvux `skv-<skolenhetskod>`. Förskolor har `scb-<hash>`, en hash av kommunkod, normaliserat namn och adress. Den är stabil så länge namn och adress inte ändras, eftersom SCB:s fil saknar ett eget stabilt id. `extra.slug` är unik inom filen (namn + ort, vid behov också kommun).
- `typ`: `kommunal förskola`, `fristående förskola`, `komvux` eller `sfi` (enhet som bara har sfi).
- `kedja`: huvudmannens namn, t.ex. "Malmö kommun" eller "Pysslingen Förskolor AB". Det blir `null` när huvudmannen är en enskild firma, eftersom namnet då är en persons namn.
- `epost`: endast funktionsadresser. `officialEmail()` stryker förnamn.efternamn-mönster och rektorns namn. Rektorsnamn sparas aldrig.
- `kommuner.json`: `{ kommunkod, namn, lan, lanskod, slug }`. Håbo och Habo krockar, så Håbo får `habo-uppsala`.

### Förskolor – `extra`
- `huvudmanstyp`: `kommunal` eller `enskild`, utifrån SCB:s företagsnamn.
- `antal_barn`, `barn_per_grupp`, `andel_forskollarare`: alltid `null`. Skolverket publicerar dem inte per förskoleenhet.
- `kommunsnitt`: Skolverkets kommunvärden för samma regi (barn per grupp, barn per heltidstjänst, andel med förskollärarexamen, antal förskoleenheter). Visa dem som kommunsnitt och aldrig som förskolans egna värden.
- `inriktning`: härledd ur namn, huvudman och OSM-taggar (Montessori, Waldorf, I Ur och Skur, föräldrakooperativ, kristen m.fl.).
- Från OSM, när en matchning finns (namnlikhet inom 250 m, eller inom 40 m för OSM-objekt utan namn): `webb`, `telefon`, `epost`, `oppettider`, `osm_kapacitet`, `alder`, `rullstolsanpassad`, `osm`, `osm_namn`.
- `tatort`, `deso`, `scb_ar`.

### Komvux – `extra`
`skolenhetskod`, `huvudmanstyp` (kommunal, kommunalförbund, region eller enskild), `huvudman_orgnr`, `huvudman_kommuner` (för kommunalförbund), `skolnamn`, `nivaer`, `sfi`, `grundlaggande`, `gymnasial`, `anpassad`, `egen_regi`, `entreprenad_anordnare`, `ovriga_skolformer`, `startdatum`, `kalla_andrad`.

### Övriga filer
- `kommunstatistik.json`: förskola-, komvux- och sfi-mått per kommun och för riket (`"00"`). Mått: förskoleenheter, inskrivna barn, barn per grupp (totalt, 1–3 år och 4–5 år), personaltäthet, andel förskollärare, elever på komvux grundläggande och gymnasial nivå, andel på distans, andel hos annan anordnare, sfi-elever samt andel godkända och avbrutna.
- `komvux_per_kommun.json`: för alla 290 kommuner finns enheter i kommunen, enheter via kommunalförbund, huvudmän, entreprenadanordnare, `status`, `centralort`, `narmaste_enheter` (5 st med avstånd) samt `planerade_kurser_utbildningsguiden` (se not i filen).
- `forskolor_tackning.json`: antal per kommun jämfört med Skolverkets officiella antal förskoleenheter.
- `rapport.json`: antal, fälttäckning och valideringsfel.

## Källor och villkor

| Källa | Används till | Villkor |
|---|---|---|
| SCB, Öppna geodata – Förskolor (Företagsregistret, SNI 85100, årlig) | Förskolelistan: namn, huvudman, adress, kommun, koordinat | CC0 (SCB öppna data). Källhänvisning frivillig, rekommenderat "Källa: SCB". |
| Skolverket, Skolenhetsregistret API v2 | Komvux- och sfi-enheter, huvudmän, entreprenadavtal | Öppna data, fri användning med källhänvisning |
| Skolverket, Planned Educations API v4 | Antal planerade komvuxkurser per kommun | Som ovan |
| Skolverkets statistikdatabas (PxWeb) | Kommunala jämförelsetal för förskola, komvux och sfi | Som ovan |
| SCB, PxWeb-regionlista | Kommun- och länsnamn | CC0 |
| SCB, GeoServer WFS (DeSO 2025, tätorter 2023) | Kontroll av kommun, tätort, centralort | CC0 |
| OpenStreetMap via Overpass | Berikning av förskolor med webb, telefon, öppettider m.m. | ODbL 1.0. Visa "© OpenStreetMap-bidragsgivare" med länk. Härledda databaser omfattas av share-alike. |

## Kända begränsningar
- Förskolor finns inte i Skolenhetsregistret (status november 2026) och Skolverket har inget öppet förskoleregister. SCB:s fil räknar arbetsställen, medan Skolverket räknar förskoleenheter. Därför är det 9 786 rader mot 8 541 enheter, och en enhet med flera hus kan ge flera rader.
- SCB-filen ger en ögonblicksbild från december varje år. Nya och nedlagda förskolor syns först vid nästa årsfil. OSM-objekt som inte matchar något i SCB-filen sparas för granskning i `data/raw/osm_omatchade_forskolor.json`, men de publiceras inte.
- Webb och telefon för förskolor finns bara där OSM har dem, ungefär 6 % respektive 2 %.
- 32 kommuner har ingen komvux-enhet i Skolenhetsregistret (de köper troligen via samverkansavtal). För dem finns `narmaste_enheter` i `komvux_per_kommun.json`.
