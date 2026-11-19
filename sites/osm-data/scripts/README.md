# osm-data: OSM-dataset för bensinstationer.nu, parkeringar.nu, lekplatserna.nu, simhallar.se

Beroendefria Node-skript (Node 18+, testat på Node 24). All data kommer från OpenStreetMap via Overpass API.

## Köra

```sh
cd "<sökväg>/natverk/sites/osm-data"

# Nattlig körning (allt i ett): Overpass om den svarar, annars Geofabrik-PBF, sedan bygge
node scripts/run.mjs
node scripts/run.mjs --source=pbf --pbf="C:/sökväg/sweden-latest.osm.pbf"   # tvinga PBF med befintlig fil
node scripts/run.mjs --source=overpass                                        # bara Overpass

# Stegvis
node scripts/fetch.mjs                     # Overpass -> data/raw/*.json (cache: filer < 12 h återanvänds)
node --max-old-space-size=6144 scripts/extract-pbf.mjs --pbf="<fil>"   # ELLER: PBF -> samma data/raw/*.json
node --max-old-space-size=6144 scripts/extract-pbf.mjs --download      # laddar ned Geofabrik till data/cache/ (om > 20 h gammal)
node scripts/build.mjs                     # data/raw -> data/*.json + meta.json + kommuner.json (~1-2 min)
```

Windows Schemaläggaren (03:30 varje natt):

```powershell
schtasks /Create /SC DAILY /ST 03:30 /TN "osm-data nightly" /TR "cmd /c cd /d \"<sökväg>\natverk\sites\osm-data\" && node scripts\run.mjs >> data\run.log 2>&1"
```

### Källor och körtid

- **Overpass** (`fetch.mjs`): 11 sekventiella frågor, 10 s paus, retries med backoff. Servrar i ordning: maps.mail.ru, overpass.private.coffee, overpass-api.de, overpass.kumi.systems (`OVERPASS_URL=` för att lägga till en egen först). 2026-11-19 svarade alla med 504/timeout under flera timmar, så första datasetet byggdes från PBF.
- **Geofabrik PBF** (`extract-pbf.mjs` + `pbf.mjs`): egen beroendefri PBF-läsare (zlib). Tre pass över filen (relationer, vägar, noder), ca 20 min och 1-2 GB RAM för Sverige (1 GB fil). Ger identiskt format i `data/raw/` som Overpass-vägen. Bonus: räknar ut `area_m2` för parkeringsytor.
- Objekt utanför alla svenska kommunpolygoner (PBF-utdraget går över gränsen) tas bort; punkter <500 m utanför snäpps till närmaste kommun.

### Justera parkeringsfiltret

`PARK_MIN_CAP` (standard 20) och `PARK_MIN_AREA_M2` (standard 0 = av) som miljövariabler till `build.mjs`, t.ex. `PARK_MIN_AREA_M2=2500 node scripts/build.mjs` tar också med stora namnlösa ytor. `data/meta.json -> filter.parkeringar.what_if_publika` visar hur många objekt olika trösklar ger (kräver PBF-källan för ytor).

## Utdata (`data/`)

| Fil | Innehåll |
|---|---|
| `bensinstationer.json` | amenity=fuel (utom access=private/no) |
| `parkeringar.json` | amenity=parking som har namn, ELLER capacity ≥ 20, ELLER parking=multi-storey/underground. Exkluderar access=private/customers/no/permit/delivery/employees/residents samt garage_boxes/carports/sheds utan publik access |
| `lekplatser.json` | leisure=playground (alla, utom access=private/no). `extra.namngiven` = har OSM-namn |
| `simhallar.json` | sports_centre/sports_hall/building med sport=swimming, water_park, amenity=public_bath (med badnamn), namngivna inomhusbassänger och objekt med namn som "simhall/badhus/äventyrsbad". Exkluderar privata, kundpooler, hotell/camping/resort (tagg, namn eller läge inuti hotellpolygon), kallbadhus/utomhusbad/badplatser. Dubbletter (bassäng inuti hall, byggnad inuti anläggning) slås ihop |
| `kommuner.json` | 290 kommuner: kommunkod, namn, län, antal objekt per dataset |
| `meta.json` | attribution/licens, OSM-tidsstämpel, filterstatistik, täckningsstatistik |

Gemensamt schema per objekt: `id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb, oppettider, extra, kallor, uppdaterad`.

- `kommun`/`lan`: point-in-polygon mot OSM:s administrativa gränser (admin_level 7 och 4), even-odd ray casting med bbox-filter. Kommunnamn = OSM `short_name` (identiskt med SCB:s namn för alla 290). Län härleds från kommunkodens två första siffror. Punkter utanför alla polygoner (kust/hav) får närmaste kommun inom 3 km. `extra.kommunkod` = SCB-kod.
- `ort`: `addr:city`, annars närmaste place=city/town/village/suburb (lätt viktad mot större orter, max 12 km), annars hamlet inom 2 km. `extra.ort_kalla` anger källan.
- `namn`: OSM-namn. Bensinstationer utan namn: `<brand> <ort>`; kedjenamn som inte är unika ("Circle K") får orten tillagd ("Circle K Mora"), originalet ligger i `extra.osm_namn`. Parkeringar/lekplatser utan namn: "Parkering vid X"/"Lekplats vid X" där X = addr:street eller närmaste namngivna väg inom 120 m, annars `null`.
- `oppettider`: `{mon..sun}` med `"HH:MM-HH:MM"` (flera intervall kommaseparerade), `"stängt"`, eller hela objektet `null` om opening_hours saknas eller är för komplext (månader, veckor, kommentarer, soluppgång...). Dagar som inte nämns i regeln = `"stängt"`, PH-regler ignoreras. Råvärdet finns i `extra.opening_hours_osm`.
- `uppdaterad`: datum för OSM-datat.

## Licens / attribution (ODbL)

Data © OpenStreetMap-bidragsgivare, Open Database License (ODbL) 1.0. Varje sida som visar datat ska visa:
`© OpenStreetMap-bidragsgivare (ODbL)` med länk till https://www.openstreetmap.org/copyright. Texten finns även i `data/meta.json` (`attribution`, `attribution_html`).
