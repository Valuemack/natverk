# Guide-backlog – parkeringar.nu

Kandidater till nästa omgång guider. Ingen av dem är byggd. Regel (SEO-playbook §0): en guide byggs bara om den kan bli 1 200–2 000 ord med egen data eller förstahandskällor. Annars byggs den inte alls.

Volymer: uppmätta månadsvolymer finns bara för huvudtermerna i `klusterranking.csv`: parkering 135 000, parkering göteborg 49 500, ställplats 18 100, parkering stockholm 18 100, parkeringshus 9 900. Sökordsfilerna från 2026-11-19 och 2026-11-24 har nästan inga parkeringsord. För kandidaterna nedan är volymen **inte uppmätt**. GSC-visningar (18–27 nov 2026) anges där de finns. Kolumnen "Bedömning" är en uppskattning och ska ersättas med verkliga siffror innan vi prioriterar.

| # | Arbetsnamn (sökintention) | Volym | Bedömning | Egen data / källa | Kommentar |
|---|---|---|---|---|---|
| 1 | Ställplats och husbilsparkering – regler och var | ställplats 18 100 (kluster) | hög | typen husbilsparkering i datan, Transportstyrelsen, trafikförordningen | Störst uppmätt volym utan sida i dag |
| 2 | Parkering i Göteborg – taxor och zoner | 49 500 (kluster) | hög | kräver Göteborgs stads taxor (saknas i kommuntaxor.json) | Gör först kommunsidan tjock med verifierad gatutaxa, sedan ev. guide |
| 3 | Parkering vid sjukhus – pris och tillstånd | ej uppmätt | medel | datan (namn med sjukhus/lasarett), regionernas sidor | Bara om regionernas taxor kan verifieras |
| 4 | Datumparkering – så fungerar den | ej uppmätt | medel | kommunernas lokala trafikföreskrifter (STFS/RDT) | |
| 5 | MC-parkering – regler och pris | ej uppmätt | medel | MC-taxor finns i kommuntaxor.json, trafikförordningen | |
| 6 | Laddplats i brf och på privat mark | ej uppmätt | medel | Energimyndigheten, Boverket, bidragsregler | Skilj från guiden om att ladda på parkering |
| 7 | Parkera på privat mark och tomt | ej uppmätt | medel | lag 1984:318, Konsumentverket | Kan bli för nära kontrollavgift-guiden; bygg bara om egen intention |
| 8 | Långtidsparkering vid Arlanda och Landvetter | ej uppmätt | medel | Swedavias prislistor (verifiera med datum) | Flyghubben finns, guide ger prisjämförelse |
| 9 | Vinterparkering och snöröjning | ej uppmätt | låg–medel | kommunernas städ- och snöröjningsregler | Säsong: okt–mar |
| 10 | Parkering vid färjeläge (Gotland, Finland, Tyskland) | ej uppmätt | låg–medel | rederiernas och hamnarnas sidor | |

Kommuner med GSC-trafik som togs bort i grinden (visas som sektion på länssidan): Lerum (54 visningar) och Vetlanda (51). De får tillbaka egen sida om kommunens taxa verifieras och läggs i `data/kommuntaxor.json`.
