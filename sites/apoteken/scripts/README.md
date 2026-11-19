# apoteken.nu – datapipeline

Bygger `data/apotek.json` (alla öppenvårdsapotek med tillstånd från Läkemedelsverket) plus
`data/kommuner.json` (290 kommuner), `data/rapport.json` (täckning, dubbletter, omatchade) och
`data/slugs.json` (stabila URL-slugs, id -> slug; ta inte bort den, då kan URL:er ändras).

Node 20+ krävs, inga beroenden.

## Köra allt (nattligt)

```sh
cd "<sökväg>/natverk/sites/apoteken"
node scripts/run-all.mjs
```

Tar 5–35 minuter. Nästan all tid går åt till Overpass, vars servrar ofta är överbelastade (502/504), och då provas nästa spegel. Ett steg som misslyckas behåller förra körningens råfil i `data/raw/`.
Bara LV-hämtningen och merge kan få körningen att avbrytas (exit-kod 1).

## Steg

| Skript | Källa | Utdata |
|---|---|---|
| `fetch-lv.mjs` | Läkemedelsverket, JSON-API:t bakom [Sök apotek som har tillstånd](https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand) (`/api/pharmacy/search`). Masterlista: namn, adress, kommun, län, tillståndshavare, GLN | `data/raw/lv.json` |
| `fetch-scb.mjs` | SCB PxWeb: kommun- och länskoder (CC0) | `data/raw/scb-kommuner.json` |
| `fetch-chains.mjs` | Kedjornas egna "hitta apotek"-data: ett anrop per kedja (Apoteket, Kronans Apotek inkl. f.d. Apoteksgruppen, Apotek Hjärtat) | `data/raw/chains.json` |
| `fetch-osm.mjs` | OpenStreetMap via Overpass (`amenity=pharmacy` / `healthcare=pharmacy` inom Sverige, 11 latitudband, flera speglar) | `data/raw/osm.json` |
| `merge.mjs` | Slår ihop allt | `data/apotek.json`, `kommuner.json`, `rapport.json`, `slugs.json` |
| `geocode.mjs` | Nominatim, men bara för apotek som saknar koordinater. Max 1 anrop/s, cachas för alltid i `data/raw/geocode-cache.json` | cache |

Köra ett steg i taget: `node scripts/fetch-osm.mjs` och sedan `node scripts/merge.mjs`.

## Matchning (merge.mjs)

1. Kedjepost -> LV via **GLN** (Apoteket, Kronans).
2. Annars poäng för postnummer, gatunamn/husnummer, namn (utan ortnamn), ort, avstånd och kedja.
   Bästa par tilldelas först, ett-till-ett, och kräver minst 5 poäng. Det gäller till exempel Hjärtat, som saknar GLN.
3. Därefter: den enda omatchade butiken för en kedja i en ort, på båda sidor, räknas som samma apotek.
4. OSM -> LV med samma poängsättning. Nu finns kedjornas koordinater, så avstånd väger tungt.
   Fler OSM-objekt inom 40 m rapporteras som dubbletter.
5. Kommun och län tas direkt från LV, som har kommun för alla poster. Namnet slås upp exakt mot SCB:s lista för att få kommunkod
   (Håbo och Habo skiljs bara åt av å). Län härleds från kommunkoden.

Prioritet: koordinater från kedja, sedan OSM, sedan geokod. Öppettider från kedja, sedan OSM `opening_hours` (enkla regler).
Telefon från kedja (oftast centralnummer 0771-…, `telefon_typ: "kundservice"`), sedan OSM.
Apoteket och Hjärtat publicerar bara datumsatta tider för kommande 7–8 dagar. Dagar som är helgdagar eller aftnar
läggs i `avvikande_oppettider`, och veckodagen får förra körningens värde. Kronans ger ordinarie tider plus avvikelser.

## Licenser och villkor

- **OpenStreetMap (ODbL 1.0):** visa "© OpenStreetMap contributors" med länk till openstreetmap.org/copyright
  på sidor som använder OSM-härledda data (`kallor` innehåller "OpenStreetMap"). Databasen som härleds är ODbL (share-alike).
- **Läkemedelsverket:** "Sök apotek som har tillstånd" finns med på myndighetens sida [Öppna data](https://www.lakemedelsverket.se/sv/om-webbplatsen/oppna-data),
  som anger CC0 1.0 eller CC BY 4.0. Skriv alltid "Källa: Läkemedelsverket" för säkerhets skull.
- **SCB:** CC0.
- **Kedjorna:** robots.txt tillåter sökvägarna som används, och inga villkor förbjuder automatisk hämtning.
  Kronans köpvillkor anger dock att innehållet skyddas av upphovsrätt, och fullständig återkommande extraktion
  kan omfattas av katalog-/databasskydd (URL 49 §). Därför: ett anrop per kedja och natt, återpublicera
  bara fakta (adress, tider) och inga texter eller bilder.
- **DOZ Apotek (f.d. LloydsApotek):** hoppas över. robots.txt på dozapotek.se och lloydsapotek.se har `Disallow: /` för
  ClaudeBot, anthropic-ai, GPTBot och liknande. Deras tider och koordinater kommer bara från OSM.
