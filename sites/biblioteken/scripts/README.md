# biblioteken.nu – data pipeline

Builds `data/bibliotek.json` (all Swedish public libraries: folkbibliotek, branches, bokbussar), using the
shared network schema, plus `data/kommuner.json` for the kommun pages.

Node 18+ (tested on 24), no dependencies. Run every command from the site folder:

```bash
cd "<sökväg>/natverk/sites/biblioteken"
node scripts/run-all.mjs              # full nightly run: fetch all sources, then build
node scripts/run-all.mjs --skip-web   # skip the optional website step (it is slow and finds little)
node scripts/run-all.mjs --offline    # rebuild only, from data/raw/*
```

Exit code: 0 = ok, 1 = build failed (outputs not overwritten), 2 = a required fetch failed and the
build used the previous raw file. Nightly on Windows (Task Scheduler), for example:
`schtasks /Create /SC DAILY /ST 03:30 /TN biblioteken-data /TR "node \"<sökväg>\natverk\sites\biblioteken\scripts\run-all.mjs\" --skip-web"`

## Steps

| Script | Source | Output (`data/raw/`) | Time |
|---|---|---|---|
| `fetch-scb.mjs` | SCB PxWeb API: official kommun and län codes and names (CC0) | `scb-regioner.json` | 1 s |
| `fetch-bibdb.mjs` | KB Biblioteksdatabasen API `https://bibdb.libris.kb.se/api/lib?dump=true&country_code=se` (200 per page, 1 request/s) | `bibdb-se.json` | 30 s |
| `fetch-osm.mjs` | OpenStreetMap Overpass: `amenity=library` grouped by kommun polygon (admin_level 7) | `osm-libraries.json` | 1–3 min |
| `fetch-osm-isin.mjs` | Overpass `is_in`: which kommun polygon contains each bibdb coordinate | `osm-isin.json` | about 18 min (5 batches of 400) |
| `fetch-web.mjs` (optional) | Library websites, **only** schema.org JSON-LD `openingHoursSpecification` | `web-hours.json` | about 10 min |
| `build.mjs` | merge everything, offline | `data/*.json` | 5 s |

Overpass: `overpass-api.de` comes first, then mirrors (`maps.mail.ru`, `overpass.private.coffee`,
`overpass.kumi.systems`). Override with `OVERPASS_URLS=url1,url2`. From this machine curl got a TLS
error from overpass-api.de, but Node's fetch worked.

Each fetch script checks its result (minimum counts) before writing, so a broken source never replaces
a good raw file.

## Outputs

* `data/bibliotek.json`: array in the shared schema
  `{ id, namn, kedja, typ, gatuadress, postnummer, ort, kommun, lan, lat, lon, telefon, webb, oppettider{mon..sun}, extra{meroppet,...}, kallor[], uppdaterad }`
  * `id` = `bibdb-<sigel>`. The KB sigel is stable, so URLs can be built from `extra.slug`, which is unique.
  * `typ`: `huvudbibliotek` | `filial` | `bokbuss` | `utlaningsstation` | `bibliotek` (kommun where no main library could be identified).
  * `oppettider` values: `"10:00-19:00"`, several spans `"10:00-12:00,13:00-18:00"`, `"stängt"` or `null` (unknown).
    These are the regular weekly hours. OSM seasonal rules are evaluated for the build date. `extra.oppettider_text`
    holds the raw source string, `extra.oppettider_kalla` is `osm` / `bibdb` / `webb`, and `extra.oppettider_komplett`
    is true when all 7 days are known.
  * Seasonal OSM values: only rules whose date or week range contains the build date are applied. A later rule
    overrides an earlier one only for the days it lists. Exception for "season blocks": when the first rule starts
    with a date or week selector (`Jan 01-Jun 17, Aug 13-Dec 31 Mo-Th …; Fr …; Jun 18-Aug 12 …`), later rules without
    their own selector inherit the previous one. That is what taggers mean, although strict OSM syntax says otherwise.
  * `extra.oppettider_sommar` / `extra.oppettider_vinter`: `{ fran, till, tider: {mon..sun} }`, only when a clear
    summer/winter split exists. OSM values are evaluated day by day for the build year (Jul 15 against Jan 15). For
    bibdb text a "Sommartider …" section is used. `fran`/`till` are `"MM-DD"`, `"vNN"` (ISO week) or `null` (vague text,
    e.g. "mitten av juni"). `extra.oppettider_sasong` is `sommar` / `vinter` / `null` for the build date.
  * Parser tests: `node --test scripts/test-hours.mjs`.
  * `extra.meroppet`: `true` when any source says there are self-service hours, otherwise `null` (unknown, never `false`).
    `extra.meroppet_tider` holds the self-service hours when known.
  * `extra.kommun_kalla`: `bibdb_kommunkod` (bibdb municipality_code mapped to SCB names), `koordinat_osm_polygon`
    (coordinate inside the OSM kommun boundary; also used to correct bibdb codes when postcode or ort agrees), `ort`, `postnummer`.
  * `extra.koordinat_kalla`: `osm` (matched OSM building/node, preferred) or `bibdb`.
* `data/kommuner.json`: all 290 kommuner `{ kommunkod, namn, lan, slug, kedja, antal_bibliotek, huvudbibliotek, bibliotek[] }`.
* `data/rapport.json`: run statistics, every excluded bibdb record with its reason, and data-quality warnings.
* `data/osm-omatchade.json`: OSM library elements that were not matched. Many are school or university libraries,
  some are public libraries missing from bibdb. Review these by hand.

## Selection rules (build.mjs)

Records come from bibdb `library_type` `folkbib`/`folkskolbib` (plus `skolbib` with subtype `kommunbib`)
where `alive` is true. The build then excludes:
* e-media, fjärrlån, lånecentral, depot, regional and county units, test records, and hospital or institution libraries
* records that bibdb's free text marks as closed ("Nedlagt", "STÄNGT", "lades ner", ...)
* admin records with no visiting address or coordinates
* duplicates: same address or coordinates within 25 m, the same name in the same kommun, and similar cases
  (see `rapport.json` → `exkluderade`)

Note: bibdb `busbib` means company libraries, not bokbussar. Bokbussar are found by name.

Manual fixes go in `scripts/overrides.json`:
`libraries.<sigel>.{namn, typ, exclude, include}` and `kedja.<kommunkod>`.

## Licences and attribution (show on the site)

* **Biblioteksdatabasen**, Kungliga biblioteket (bibdb.libris.kb.se). KB publishes it openly through the API and an
  Excel export ("Datauttag"). No licence is stated on the export page or in the API docs. Libris data is CC0, but
  that has not been confirmed for bibdb, so credit "Källa: Kungliga biblioteket, Biblioteksdatabasen". Contact-person
  fields need an API key and are not used. Internal notes (`description`) are never published, and only
  function mailboxes are kept as `extra.epost`.
* **OpenStreetMap**, © OpenStreetMap contributors, ODbL 1.0. Required: "© OpenStreetMap-bidragsgivare"
  with a link to https://www.openstreetmap.org/copyright. The output database is a derived database under ODbL
  share-alike, so offer the merged data under ODbL if it is redistributed.
* **SCB** regional codes: CC0.
* **Library websites**: only JSON-LD is used, robots.txt is respected, and hosts that block AI agents, set
  Crawl-delay above 10 s or show bot protection are skipped (see `web-hours.json` → `summary`).
