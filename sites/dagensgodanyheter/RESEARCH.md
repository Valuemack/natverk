# Research – dagensgodanyheter.se

Underlag för sajtens struktur och SEO, insamlat 2026-11-25. Tidningar och andra sajter har **bara studerats för struktur**. Inga texter, logotyper, färger eller varumärken har kopierats, och inga tidningsartiklar skrivs om.

## 1. Svenska nyhetssajter (struktur)

**Lästa:** svt.se/nyheter och gp.se (robots.txt, startsida, kategorisida, artikel och GP:s nyhetssitemap). **Gick inte att läsa:** aftonbladet.se, expressen.se, dn.se och svd.se. Hämtningsverktyget nekades. Vi försökte inte igen.

| | SVT | GP |
|---|---|---|
| robots.txt | Tillåter sökmotorer och AI-sök, blockerar cirka 50 träningsbotar. Ingen nyhetssitemap listad. | Blockerar cirka 50 AI- och skrapbotar (även ChatGPT-User/OAI-SearchBot). Listar `news-sitemap.xml`. |
| Startsida | "Just nu"-rad, toppblock med stort kort och mindre kort, "Senaste nytt" som textlista, "Mest tittat". | "Just nu"-rad, toppkort, sedan rader per avdelning ("Senaste nytt \| Kultur" osv.), "Andra läser". |
| Kategorisida | Toppkort och lista med miniatyrer, "Fler artiklar". | Toppkort och lista, sidospalt med senaste. |
| Artikel | Bild 16:9 med fotokredit, H1, publicerad/uppdaterad med absolut tid, ingress, 2 H2, faktaruta, källrad, ämneslänkar, "Relaterat", länk till "Hittat fel?" och "Så arbetar vi". | Bild med kredit, H1, ingress, byline ("Text: Namn/TT"), 2 H2, faktaruta (H3), ämneslänkar med följ-knapp, senaste i avdelningen. |
| Nyhetssitemap | – | `xmlns:news`, `news:publication` (namn och språk "sv"), `publication_date` i ISO 8601, `news:title`. Nyast först. |

**Det vi tar med oss (egen utformning):** en tidningslayout med toppnyhet, rutnät och avdelningsrader. Artiklar har H1, ingress, 2–4 H2, faktaruta, källruta, ämnen och relaterat. Publicerad/uppdaterad visas med absolut tid. Rättelselänk och "Så arbetar vi" ligger nära artikeln.

## 2. Utländska sajter med positiva nyheter

**Positive News (UK):**
- Avdelningar, toppnyhet och rutnät.
- Partnerinnehåll är tydligt märkt.
- Om-sida med ägarform, pressetisk tillsyn och rättelsepolicy.
- Försiktiga formuleringar ("ännu inte granskad"), med källorna namngivna i texten.

**Good News Network (US):**
- Horoskop, "dagens citat", affiliate-butik i huvudmenyn och upprepade banners.
- Artiklarna är ofta en omskrivning av ett enda pressmeddelande, utan reservationer.
- Ingen synlig redaktionell policy.
- Det här är exempel på vad vi **undviker**.

**Reasons to be Cheerful (US):**
- Ämnesmeny, läsminuter, inline-länkar till källor och kritiska röster i texten.
- Skriftlig etik- och AI-policy (all text skrivs av människor; AI får användas till sökning och transkribering).

**Skillnad mellan trovärdigt och "fluff":**
- Trovärdigt: tydlig avsändare, länkar till källan, reservationer, daterade rättelser, öppenhet om finansiering och AI.
- Fluff: omskrivna pressmeddelanden utan kontroll, klickbeten och inslag som inte är nyheter.

**Våra val:**
- Varje artikel länkar till förstahandskällan.
- AI-användningen redovisas öppet i bylinen och i `/redaktionell-policy/#ai`.
- Rättelser är daterade (`/rattelser/`).
- Läsvärdet förklaras (`/redaktionell-policy/#lasvarde`).
- Inga horoskop, inga affiliate-länkar och inga påhittade skribenter.

## 3. Googles dokumentation

**Artikeldata (Article/NewsArticle):**
- Inga egenskaper är obligatoriska. Rekommenderade: `headline`, `image` (flera, minst 50 000 pixlar, gärna 16:9, 4:3 och 1:1), `datePublished`/`dateModified` i ISO 8601 med tidszon, samt `author` med namn och URL.
- `author` ska vara Person eller Organization och aldrig ett påhittat namn.
- **Vårt val:** Author är organisationen "Redaktionen". Publisher är NewsMediaOrganization med policylänkar: publishingPrinciples, correctionsPolicy, ethicsPolicy, verificationFactCheckingPolicy och noBylinesPolicy. Vi lägger också till `isBasedOn`/`citation` till källan och BreadcrumbList.

**Nyhetssitemap:**
- Bara artiklar från de senaste **två dygnen** och högst 1 000 per fil.
- Obligatoriskt: `news:publication` (`name` exakt som i Google News, `language`), `publication_date` och `title` (utan sajtnamn och datum).
- **Vårt val:** `/nyhetssitemap.xml` med de senaste 48 timmarna. Den listas i robots.txt. En tom fil är tillåten.

**Discover:**
- Inga särskilda taggar behövs.
- Bilder ska vara minst 1 200 px breda och ha över 300 000 pixlar, helst i 16:9. Det kräver `max-image-preview:large`.
- Undvik logotyper och bilder med mycket text, liksom klickbeten och överdrifter.
- **Vårt val:**
  - `max-image-preview:large` på alla sidor.
  - Varje artikel får en `og:image` på 1280×720 (fri bild, märkt AI-bild eller avdelningens typografiska delningskort).
  - Rubriker på 50–90 tecken som säger vad som hänt.
  - Skrivreglerna förbjuder överdrifter.

**Google News (policy):** Kräver tydliga datum och bylines, information om publicisten och kontaktuppgifter, samt att sponsrat innehåll märks. → Sidorna `/om/`, `/kontakt/`, `/redaktionell-policy/` och `/rattelser/` finns. Ägaren behöver fylla i kontaktadress och ansvarig utgivare (`PUBLIC_KONTAKT_EPOST`, `PUBLIC_UTGIVARE`).

**AI-innehåll (Google, februari 2023 och "helpful content"):**
- Kvaliteten avgör, inte metoden. Automatisering som främst syftar till att manipulera ranking är spam.
- "Who/How/Why": tydlig avsändare, och öppen redovisning av hur innehållet skapats när läsaren rimligen undrar.
- En AI-"byline" är inte rätt sätt att redovisa AI. Påhittade skribentprofiler räknas som vilseledande.
- **Vårt val:** Bylinen lyder "Av redaktionen · skriven med AI-stöd och faktagranskad mot källan" och länkar till AI-avsnittet i policyn. Högst 10–15 artiklar per natt, varje artikel bygger på en verklig förstahandskälla och granskas mot den, och ingen massproduktion.

## 4. Sökord

Ordlistan `sokordslistor-2026-11-24/volymer-2026-11-24.json` saknar nyhetsord ("goda nyheter", "positiva nyheter", "glada nyheter idag" m.fl.). Navsidorna `/positiva-nyheter/` och `/glada-nyheter-idag/` bygger därför på sökintentionen, inte på uppmätta volymer. Volymerna bör hämtas i nästa sökordsuttag och tas med i Search Console-uppföljningen.

## 5. Källor och robots.txt (praktiska fynd)

- Hämtaren följer robots.txt strikt enligt RFC 9309: längsta regel vinner, 4xx betyder att filen saknas och allt är tillåtet, och 5xx eller ingen kontakt betyder att allt är spärrat. Högst ett anrop per sekund.
- **Spärrade för botar:**
  - FN:s nyhetsflöden (`/feed/`). Vi använder FN:s pressflöde i stället.
  - EEA, Eurostats sökflöde, RISE, NIH och Oxford.
- **Wikimedia Commons** spärrar `/w/` och `/api/` för alla botar. Det gör att Commons API inte kan användas för bildsök utan att robots.txt bryts. Bildmodulen försöker, nekas och går vidare.
- **Openverse** spärrar `/v1/images/`.
- **Bilder som fungerar:** NASA:s bildarkiv (public domain). Partnerbilder märkta ESA, JAXA eller © filtreras bort. Annars skapas en märkt AI-bild (OpenAI) som visar ämnet, eller så publiceras artikeln utan bild.
- Flera svenska myndigheter publicerar sina egna pressmeddelanden via `via.tt.se` eller Mynewsdesk. Det är organisationens egen text och alltså förstahandskälla, inte nyhetsbyråns.

## 6. Tidningsform (studie 2026-11-25, omgång 2)

**Lästa:** dn.se, svd.se, aftonbladet.se, expressen.se, gp.se, svt.se och theguardian.com: startsida, en artikel och huvud-CSS. **Gick inte att läsa:** nytimes.com och ft.com, som har botspärr. Vi försökte inte igen. Inga logotyper, typsnittsfiler eller färgscheman har kopierats. Bara gemensamma mönster har tagits med.

**Gemensamma mönster:**
- **Rubriker och etiketter:** rubrikserif kombinerad med grotesk för etiketter, meny och byline.
- **Rubrikskala:** fyra nivåer, ungefär 48 / 32 / 22 / 17 px, med tätt radavstånd (1,05–1,2).
- **Brödtext:** 17–18 px serif med radavstånd 1,45–1,55 och en spalt på 520–620 px. Ingressen är något större och fetare.
- **Färg:** nästan svart text på vitt eller papper, och en enda accentfärg. Accentfärgen används till toppstreck, vinjetter, siffror i "mest lästa" och nyhetsetiketter.
- **Linjer:** artiklar skiljs åt med hårfina linjer och luft, aldrig med lådor, skuggor eller rundade hörn.
- **Tidningshuvud:** 3–4 px toppstreck, namnvinjett, hårfin linje, datumrad och en liten nyttorad i versaler.
- **Layout:** dominerande huvudnyhet, en högerspalt med "mest lästa" (stora siffror) och spalten "Senaste nytt".
- **Mörkt läge:** varmt nästan svart (#141414–#171717), ljusare accentfärg och linjer med cirka 15 % vitt.

**Typiska tecken på mall- eller AI-bygge (undviks):** rundade kort med skugga, toningar, lila accentfärg, ett enda typsnitt i en vikt, jämnt rutnät utan dominerande huvudnyhet, ikoner på avdelningsetiketter och för breda textspalter.

**Våra val:**
- Source Serif 4 för rubriker och text, Libre Franklin för etiketter. Båda är OFL och självhostade.
- Namnvinjetten är satt i Libre Caslon Text och omvandlad till konturer.
- Djupgrön accentfärg (#0d5c3f, i mörkt läge #6cc79a) och papper #fbf9f5.
- Förstasidan har tre spalter: Senaste, huvudnyhet och Mest läsvärt med Världen i siffror.
