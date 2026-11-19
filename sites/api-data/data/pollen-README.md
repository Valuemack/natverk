# Pollendata (pollenläget.se)

Källa: **Palynologiska laboratoriet, Naturhistoriska riksmuseet** (Pollenrapporten), öppet API
`https://api.pollenrapporten.se/v1` (OpenAPI 2.1.0, docs: https://api.pollenrapporten.se/docs).
Ingen nyckel eller registrering krävs.

## Licens och källhänvisning (ska visas på sajten)

Villkor: https://www.nrm.se/natur--och-miljoovervakning/pollenovervakning/pollenrapporten/anvanda-vara-oppna-data

- **Prognoser (text och nivåvärden): CC BY-ND 4.0.** Kommersiell användning är tillåten, men materialet
  "får inte ändras". Visa prognostexten ordagrant och ange källan. Skriv egna texter *bredvid* den,
  inte i stället för den. Visa alltid prognosens datum.
- **Övriga öppna data (t.ex. uppmätta halter): CC BY-SA 4.0.** Kommersiell användning är tillåten. Nya verk ska spridas under samma licens.
- Källtext: "Palynologiska laboratoriet, Naturhistoriska riksmuseet".
- Riktlinjer: använd bara dokumenterade API:er, undvik massnedladdning, hämta inte samma data upprepade gånger och använd senaste uppdateringen.

## Filer

| Fil | Innehåll |
|---|---|
| `pollen-regioner.json` | 24 regioner: 23 mätorter (Stockholm, Malmö, Kiruna …) plus `Sverige` (`hela_landet: true` = riskprognos för hela landet). Fält: `id`, `namn`, `slug`, `hela_landet`, `lat`, `lon`. |
| `pollen-typer.json` | `typer`: 15 pollen- och sporslag med `har_prognoser`, `har_matningar` och `gransvarden` (övre gränser i korn/m³ för låg, måttlig, hög och mycket hög; gränsvärdet räknas till den lägre klassen). Alternaria, Cladosporium och Epicoccum (svampsporer) har bara mätningar och inga prognoser. `nivaer`: prognosskalan 0–7 (Inga halter, Låga, Låga till måttliga, Måttliga, Måttliga till höga, Höga, Höga till mycket höga, Mycket höga). |
| `pollen-prognoser.json` | `_meta` och `prognoser[]`: den senaste (`current=true`) prognosen per region. Fält: `id`, `region_id`, `region`, `start`, `slut`, `sasongsslut`, `text` (ordagrant, med CRLF), `bilder`, `dagar[]` = `{ datum, nivaer: [{ pollen_id, pollen, niva, niva_text }] }`. |
| `pollen-matningar.json` | Uppmätta dygnsvärden de senaste N dagarna (standard 7): `datum`, `region`, `pollen`, `dygnsvarde`, `beskrivning`, `tekniskt_fel`. Tekniskt fel betyder att data saknas. Det är inte samma sak som 0. |
| `pollen-exempel-sasong.json` | Arkivexempel från 2026-05-12, som visar hur data ser ut i säsong: 24 prognoser (23 regioner med 4 dagars nivåer × 10 pollenslag, `Sverige` med bara text) och 305 mätvärden. |

## Säsong och uppdateringsfrekvens

- Säsongen 2026 började med en första prognos den 2026-01-21 (hassel och al). Den täta prognosperioden var cirka mars–september. Den sista prognosen hade `isEndOfSeason: true` (2026-09-18, riskprognosen gällde till 2026-09-30).
- **Nu (november) finns inga aktiva prognoser.** Alla 24 "current"-prognoser är förra säsongens sista, och `dagar` är tom. Sajten måste hantera vinterläget, till exempel med texten "Säsongen är slut, nya prognoser i vår" och säsongsfakta.
- I säsong ges nya prognoser ut flera gånger i veckan per region, ofta dagligen i maj (oftast 1–4 dagar långa). Publiceringstiden är inte dokumenterad. En ny prognos ersätter den gamla när de överlappar. Hämta **3–4 gånger per dag i säsong** (t.ex. 07:30, 10:30, 14:00, 18:00) och **1 gång per dag eller vecka utanför säsong**.
- Arkiv: `/v1/forecasts` utan `current` ger hela historiken (ca 8 000 prognoser) med `start_date`/`end_date`, och `/v1/pollen-count` ger dygnsvärden. Hämta arkivet sparsamt och en gång, enligt riktlinjerna.
- Filtret `start_date`/`end_date` returnerar prognoser som ligger inom intervallet. För "prognosen som gällde dag D": `?start_date=D&end_date=D+1&current=true`.
