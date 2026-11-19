# loppisar / secondhandbutiker – dataset scripts

Builds `data/butiker.json` (second hand shops, loppisar, Kupan etc. in Sweden). Node 24, no dependencies.

## Re-run everything (nightly)

```bash
cd "<sökväg>/natverk/sites/loppisar"
node scripts/run-nightly.mjs
```

It takes about 20–30 minutes: the chain sites take ~10 min at 1 req/s, and the OSM part takes ~10 min (a 1 GB download plus 4 passes over the file). Flags:

- `--skip-chains` reuses the last `data/raw/chain-*.json`.
- `--skip-osm` reuses the last `data/raw/osm.json`.
- `--no-download` uses the cached PBF.
- `--rebuild-boundaries` rebuilds `data/ref/kommuner.json`. It is only rebuilt automatically when the file is missing.

## Steps (each can be run on its own)

| Step | Command | Output |
|---|---|---|
| Kommun list (SCB API, CC0, refreshed every 30 days) | `node scripts/fetch-kommunlista.mjs` | `data/ref/kommunlista.json` |
| Chain store lists | `node scripts/chains/run-all.mjs [slug ...]` | `data/raw/chain-<slug>.json` |
| One chain | `node scripts/chains/erikshjalpen.mjs` | |
| OSM (Geofabrik Sweden extract) | `node --max-old-space-size=6144 scripts/fetch-osm.mjs` | `data/raw/osm.json`, `data/ref/kommuner.json`, `data/ref/geocode-index.json` |
| Merge + dedupe + kommun | `node scripts/merge.mjs` | `data/butiker.json`, `data/excluded.json`, `data/stats.json` |

Run order matters: chains → OSM → merge. The OSM step reads the chain files to find which street addresses it needs for geocoding.

## How it works

- **Chains** (`scripts/chains/*.mjs`): Erikshjälpen, Myrorna, Röda Korset, Stadsmissionen (6 orgs), PMU, Hela Människan, Lindra (Human Bridge), and Emmaus (Artikel2, Björkåfrihet). The scripts use public WP REST endpoints or HTML store pages. Every URL is checked against robots.txt, requests are limited to 1 req/s, and the User-Agent is generic (`scripts/lib/http.mjs`). A chain that fails keeps its previous raw file.
- **OSM** (`scripts/fetch-osm.mjs` + `scripts/lib/pbf.mjs`, our own PBF reader): picks up these features:
  - `shop=second_hand` and `shop=charity`
  - `second_hand=only` on a goods shop. `second_hand=yes` alone only counts for variety/general/antiques shops, which keeps out IKEA, Adlibris and ordinary record shops.
  - any `shop=*` whose name matches loppis / second hand / Kupan / Myrorna / antikvariat / …
  - `amenity=marketplace` named loppis/loppmarknad

  The rules live in `osmKind()` in `scripts/lib/classify.mjs`, and `merge.mjs` applies them again. Excluded: disused or vacant features, `second_hand=no`, `opening_hours=closed`, and car/phone/computer shops. Overpass is not used because public mirrors timed out or failed TLS from this machine.
- **Kommun**: point-in-polygon on the OSM kommun boundaries (admin_level=7 relations with `ref:scb` / `ref:se:kommun:kod`, all 290, simplified to about 30 m). Names and län come from the SCB list. Points that fall in gaps along the coast are assigned to the nearest boundary within 3 km (`kvalitet.kommun = "närmaste-gräns"`).
- **Geocoding** (chain stores without coordinates, e.g. Myrorna and Hela Människan): done offline from OSM, trying in order:
  1. exact address (`osm-adress`)
  2. nearest house number on the same street (`osm-gata`)
  3. postcode centroid (`postnummer`)
  4. ort place node (`ort`)

  `kvalitet.koordinat` records which one was used.

  A source coordinate is dropped and re-geocoded when it lies more than 15 km from both the postcode centroid and the ort, or outside every kommun. That happened to PMU Helsingborg, whose map pin was in Helsingør.
- **Dedupe**: an OSM feature is merged into a chain store when it has the same chain and is close, or has the same street and number, or a similar name within 80 m. Duplicate OSM node+way pairs are merged the same way.
  - Chain data wins. OSM fills in empty fields, and its coordinates replace geocoded postcode/ort-level ones.
  - An OSM shop of a chain whose full list we fetch (Myrorna, Erikshjälpen, Röda Korset, PMU, Lindra) that matches no listed store is treated as probably closed. It goes to `data/excluded.json`.
- **Hours**: `oppettider.mon..sun` is `"HH:MM-HH:MM"` (several ranges separated by commas), `"stängt"`, or `null` (unknown). It holds regular weekly hours only; holiday exceptions are dropped. Erikshjälpen publishes dated hours, so each weekday takes the most common value over 3 weeks.
- **id**: a slug of the name plus ort, stable as long as the name does not change.

## Licensing

- OSM data © OpenStreetMap contributors, **ODbL 1.0**. The site must show "© OpenStreetMap contributors" linking to https://www.openstreetmap.org/copyright. Because `butiker.json` mixes in OSM data it is a derived database, so if the database itself is published or shared it must be offered under ODbL. Pages produced from it only need the attribution.
- SCB kommun list: open data (CC0).
- Chain data: facts (address, hours) taken from each organisation's public store pages, with robots.txt respected. None of the sites has terms of use covering site content. See `terms_note` in each raw file. Do not copy their descriptive texts or images into the site.
