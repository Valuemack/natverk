// Källorna: förstahandskällor (myndigheter, lärosäten, forskningsinstitut, internationella organisationer och
// rymdorganisationer) och etablerade medier (typ "medium").
//
// Medier: bara redaktioner med rättelserutiner och medier som bevakar goda nyheter, med öppna flöden vars
// villkor och robots.txt tillåter oss att läsa dem. Inga betalväggar och inga nyhetsbyråer vars villkor
// förbjuder återanvändning. Medier har lägre tillit än förstahandskällor. skriv.mjs spårar alltid
// förstahandskällan bakom mediets nyhet; hittas den inte skrivs artikeln som "enligt [medium]". Aldrig
// kopierad text, aldrig nära omskrivning (scripts/lib/forstahand.mjs, kontroll.mjs).
//
// Fält:
//   id       kort nyckel (används i data och på /kallor/)
//   namn     visningsnamn
//   url      RSS- eller Atom-flöde
//   hem      källans webbplats
//   kat      förvald kategori (modellen får byta om innehållet säger annat)
//   tillit   0–1: hur pålitlig och förstahandsnära källan är (myndighet/lärosäte ≈ 0,95, organisation ≈ 0,85, företag ≈ 0,7)
//   land     "se" = svensk källa (Inrikes), "int" = internationell
//   typ      "myndighet" | "larosate" | "forskning" | "organisation" | "rymd" | "foretag" | "statistik" | "medium"
//   kortnamn (medier) namnet i "enligt …", t.ex. "The Guardian"
//
// Listan provas med `node scripts/hamta.mjs --testa`. Flöden som slutar fungera markeras med `av: true`
// och en kort `orsak` i stället för att tas bort, så att historiken syns.
// Flera svenska myndigheter publicerar sina egna pressmeddelanden via via.tt.se eller Mynewsdesk; det är
// organisationernas egna texter (förstahandskälla), inte nyhetsbyråns artiklar.

export const KALLOR = [
  // ---------- Svenska myndigheter och statliga aktörer ----------
  { id: "regeringen", namn: "Regeringskansliet", url: "https://www.regeringen.se/Filter/RssFeed?filterType=Taxonomy&filterByType=FilterablePageBase&preFilteredCategories=2099&rootPageReference=0&filteredContentCategories=1285", hem: "https://www.regeringen.se", kat: "inrikes", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "scb", namn: "SCB", url: "https://www.scb.se/feed/statistiknyheter/", hem: "https://www.scb.se", kat: "ekonomi", tillit: 0.98, land: "se", typ: "statistik" },
  { id: "naturvardsverket", namn: "Naturvårdsverket", url: "https://www.naturvardsverket.se/om-oss/aktuellt/nyheter-och-pressmeddelanden/rss/", hem: "https://www.naturvardsverket.se", kat: "miljo", tillit: 0.95, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "smhi", namn: "SMHI", url: "https://www.smhi.se/cm/nyheter-fran-smhi-1.788", hem: "https://www.smhi.se", kat: "miljo", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "folkhalsomyndigheten", namn: "Folkhälsomyndigheten", url: "https://www.folkhalsomyndigheten.se/nyheter-och-press/nyhetsarkiv/?syndication=rss", hem: "https://www.folkhalsomyndigheten.se", kat: "halsa", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "vr", namn: "Vetenskapsrådet", url: "https://via.tt.se/rss/releases/latest?publisherId=3237260", hem: "https://www.vr.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "vinnova", namn: "Vinnova", url: "https://via.tt.se/rss/releases/latest?publisherId=3235725", hem: "https://www.vinnova.se", kat: "teknik", tillit: 0.92, land: "se", typ: "myndighet" },
  { id: "energimyndigheten", namn: "Energimyndigheten", url: "https://via.tt.se/rss/releases/latest?publisherId=3236218", hem: "https://www.energimyndigheten.se", kat: "teknik", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "havochvatten", namn: "Havs- och vattenmyndigheten", url: "https://havsvattenmyndigheten.mynewsdesk.com/rss/current_news/6994", hem: "https://www.havochvatten.se", kat: "djur-natur", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "skogsstyrelsen", namn: "Skogsstyrelsen", url: "https://via.tt.se/rss/releases/latest?publisherId=415163", hem: "https://www.skogsstyrelsen.se", kat: "djur-natur", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "jordbruksverket", namn: "Jordbruksverket", url: "https://jordbruksverket.se/rss/nyheter", hem: "https://jordbruksverket.se", kat: "djur-natur", tillit: 0.95, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "raa", namn: "Riksantikvarieämbetet", url: "https://www.raa.se/feed/", hem: "https://www.raa.se", kat: "kultur", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "riksbanken", namn: "Sveriges riksbank", url: "https://www.riksbank.se/sv/rss/pressmeddelanden/", hem: "https://www.riksbank.se", kat: "ekonomi", tillit: 0.98, land: "se", typ: "myndighet" },
  { id: "konj", namn: "Konjunkturinstitutet", url: "https://www.konj.se/rss/nyheter", hem: "https://www.konj.se", kat: "ekonomi", tillit: 0.95, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "rymdstyrelsen", namn: "Rymdstyrelsen", url: "https://via.tt.se/rss/releases/latest?publisherId=3235804", hem: "https://www.rymdstyrelsen.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "rymd" },
  { id: "polarforskning", namn: "Polarforskningssekretariatet", url: "https://www.polar.se/feed/", hem: "https://www.polar.se", kat: "vetenskap", tillit: 0.93, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "kulturradet", namn: "Kulturrådet", url: "https://www.kulturradet.se/rss/nyheter/", hem: "https://www.kulturradet.se", kat: "kultur", tillit: 0.93, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "kb", namn: "Kungliga biblioteket", url: "https://www.kb.se/rss/nyheter.xml", hem: "https://www.kb.se", kat: "kultur", tillit: 0.93, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "trafikverket", namn: "Trafikverket", url: "https://via.tt.se/rss/releases/latest?publisherId=44450", hem: "https://www.trafikverket.se", kat: "inrikes", tillit: 0.92, land: "se", typ: "myndighet" },
  { id: "svk", namn: "Svenska kraftnät", url: "https://www.svk.se/Api/RSSFeed/GetNewsByCategory?name=Allm%C3%A4nnanyheter", hem: "https://www.svk.se", kat: "teknik", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "sva", namn: "Statens veterinärmedicinska anstalt", url: "https://www.sva.se/rss/nyheter/", hem: "https://www.sva.se", kat: "djur-natur", tillit: 0.95, land: "se", typ: "myndighet", av: true, orsak: "inget flöde" },
  { id: "livsmedelsverket", namn: "Livsmedelsverket", url: "https://www.livsmedelsverket.se/rss/rss-pressmeddelanden/", hem: "https://www.livsmedelsverket.se", kat: "halsa", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "socialstyrelsen", namn: "Socialstyrelsen", url: "https://www.socialstyrelsen.se/om-socialstyrelsen/pressrum/press/RssFeed/?url=https://www.socialstyrelsen.se/om-socialstyrelsen/pressrum/press/", hem: "https://www.socialstyrelsen.se", kat: "halsa", tillit: 0.95, land: "se", typ: "myndighet" },
  { id: "formas", namn: "Formas", url: "https://via.tt.se/rss/releases/latest?publisherId=3236240", hem: "https://formas.se", kat: "miljo", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "forte", namn: "Forte", url: "https://forte.se/feed/", hem: "https://forte.se", kat: "halsa", tillit: 0.93, land: "se", typ: "myndighet", av: true, orsak: "flödet uppdateras inte sedan 2025" },
  { id: "tillvaxtverket", namn: "Tillväxtverket", url: "https://tillvaxtverket.se/4.35643232185c4dc7f0b51413/12.35643232185c4dc7f0b51425.portlet?state=rss&sv.contenttype=text/xml;charset=UTF-8", hem: "https://tillvaxtverket.se", kat: "ekonomi", tillit: 0.92, land: "se", typ: "myndighet", av: true, orsak: "robots.txt spärrar flödet" },

    { id: "boverket", namn: "Boverket", url: "https://via.tt.se/rss/releases/latest?publisherId=3236499", hem: "https://www.boverket.se", kat: "inrikes", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "sametinget", namn: "Sametinget", url: "https://www.mynewsdesk.com/se/rss/current_news/129177", hem: "https://www.sametinget.se", kat: "kultur", tillit: 0.92, land: "se", typ: "myndighet" },
  { id: "region-stockholm", namn: "Region Stockholm", url: "https://www.regionstockholm.se/rss/news/", hem: "https://www.regionstockholm.se", kat: "inrikes", tillit: 0.9, land: "se", typ: "myndighet" },
  { id: "ivl", namn: "IVL Svenska Miljöinstitutet", url: "https://www.mynewsdesk.com/se/rss/current_news/3199", hem: "https://www.ivl.se", kat: "miljo", tillit: 0.88, land: "se", typ: "forskning" },

  // ---------- Svenska lärosäten och forskning ----------
  { id: "forskningse", namn: "forskning.se (svenska lärosätens pressmeddelanden)", url: "https://www.forskning.se/feed/", hem: "https://www.forskning.se", kat: "vetenskap", tillit: 0.93, land: "se", typ: "forskning" },
  { id: "ki", namn: "Karolinska Institutet", url: "https://nyheter.ki.se/latest-news/rss.xml", hem: "https://ki.se", kat: "halsa", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "uu", namn: "Uppsala universitet", url: "https://www.uu.se/appresource/4.2b8c8eef189bf820242712b2/12.2f8c577918d548f1b011b0fc/rss", hem: "https://www.uu.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "lu", namn: "Lunds universitet", url: "https://www.lu.se/nyheter-och-press/rss", hem: "https://www.lu.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "gu", namn: "Göteborgs universitet", url: "https://www.gu.se/rss/nyheter", hem: "https://www.gu.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate", av: true, orsak: "inget flöde" },
  { id: "chalmers", namn: "Chalmers tekniska högskola", url: "https://www.chalmers.se/rss/nyheter/", hem: "https://www.chalmers.se", kat: "teknik", tillit: 0.95, land: "se", typ: "larosate", av: true, orsak: "inget flöde" },
  { id: "kth", namn: "KTH", url: "https://www.kth.se/om/nyheter/centrala-nyheter?rss=news", hem: "https://www.kth.se", kat: "teknik", tillit: 0.95, land: "se", typ: "larosate", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "su", namn: "Stockholms universitet", url: "https://www.mynewsdesk.com/se/rss/current_news/59", hem: "https://www.su.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "slu", namn: "SLU", url: "https://www.slu.se/nyheter/rss?id=1802", hem: "https://www.slu.se", kat: "djur-natur", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "liu", namn: "Linköpings universitet", url: "https://www.mynewsdesk.com/se/rss/current_news/3907", hem: "https://liu.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "umu", namn: "Umeå universitet", url: "https://www.umu.se/nyheter/alla-nyheter/rssnews?id=10421080", hem: "https://www.umu.se", kat: "vetenskap", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "ltu", namn: "Luleå tekniska universitet", url: "https://www.ltu.se/4.110defe1188bd8d55c026619/12.110defe1188bd8d55c026626.portlet?state=rss&sv.contenttype=text/xml;charset=UTF-8", hem: "https://www.ltu.se", kat: "teknik", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "rise", namn: "RISE", url: "https://www.ri.se/sv/rss/nyheter", hem: "https://www.ri.se", kat: "teknik", tillit: 0.9, land: "se", typ: "forskning", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "nrm", namn: "Naturhistoriska riksmuseet", url: "https://www.mynewsdesk.com/se/rss/current_news/89", hem: "https://www.nrm.se", kat: "djur-natur", tillit: 0.93, land: "se", typ: "forskning" },
  { id: "mynewsdesk-sv", namn: "Mynewsdesk (svenska pressmeddelanden, vetenskap)", url: "https://www.mynewsdesk.com/se/rss/pressreleases/subjects/vetenskap", hem: "https://www.mynewsdesk.com/se", kat: "vetenskap", tillit: 0.75, land: "se", typ: "organisation", av: true, orsak: "ämnesflödet finns inte" },
  { id: "mynewsdesk-miljo", namn: "Mynewsdesk (svenska pressmeddelanden, miljö)", url: "https://www.mynewsdesk.com/se/rss/pressreleases/subjects/miljo", hem: "https://www.mynewsdesk.com/se", kat: "miljo", tillit: 0.72, land: "se", typ: "organisation", av: true, orsak: "ämnesflödet finns inte" },
  { id: "nobel", namn: "Nobelprize.org", url: "https://www.nobelprize.org/feed/", hem: "https://www.nobelprize.org", kat: "kultur", tillit: 0.95, land: "int", typ: "organisation" },

  // ---------- Rymd ----------
  { id: "nasa", namn: "NASA", url: "https://www.nasa.gov/news-release/feed/", hem: "https://www.nasa.gov", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "nasa-science", namn: "NASA Science", url: "https://science.nasa.gov/feed/", hem: "https://science.nasa.gov", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "esa", namn: "ESA", url: "https://www.esa.int/rss/science.rss", hem: "https://www.esa.int", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "esa-top", namn: "ESA (toppnyheter)", url: "https://www.esa.int/rssfeed/TopNews", hem: "https://www.esa.int", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "esa-eo", namn: "ESA (jordobservation)", url: "https://www.esa.int/rss/earth-observation-programmes.rss", hem: "https://www.esa.int", kat: "miljo", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "eso", namn: "ESO (Europeiska sydobservatoriet)", url: "https://www.eso.org/public/news/feed/", hem: "https://www.eso.org", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "cern", namn: "CERN", url: "https://home.cern/feed/", hem: "https://home.cern", kat: "vetenskap", tillit: 0.97, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },

    { id: "jpl", namn: "NASA JPL", url: "https://www.jpl.nasa.gov/feeds/news", hem: "https://www.jpl.nasa.gov", kat: "vetenskap", tillit: 0.97, land: "int", typ: "rymd" },
  { id: "iter", namn: "ITER (fusionsforskning)", url: "https://www.iter.org/rss.xml", hem: "https://www.iter.org", kat: "teknik", tillit: 0.93, land: "int", typ: "forskning" },

  // ---------- Internationella organisationer ----------
  { id: "who", namn: "WHO", url: "https://www.who.int/rss-feeds/news-english.xml", hem: "https://www.who.int", kat: "halsa", tillit: 0.95, land: "int", typ: "organisation" },
  { id: "un-news", namn: "FN (UN News)", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", hem: "https://news.un.org", kat: "utrikes", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "robots.txt spärrar /feed/" },
  { id: "un-klimat", namn: "FN (UN News, klimat och miljö)", url: "https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml", hem: "https://news.un.org", kat: "miljo", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "robots.txt spärrar /feed/" },
  { id: "un-halsa", namn: "FN (UN News, hälsa)", url: "https://news.un.org/feed/subscribe/en/news/topic/health/feed/rss.xml", hem: "https://news.un.org", kat: "halsa", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "robots.txt spärrar /feed/" },
  { id: "unep", namn: "FN:s miljöprogram (UNEP)", url: "https://www.unep.org/news-and-stories/rss.xml", hem: "https://www.unep.org", kat: "miljo", tillit: 0.92, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "unicef", namn: "UNICEF", url: "https://www.unicef.org/press-releases/rss.xml", hem: "https://www.unicef.org", kat: "utrikes", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "unesco", namn: "UNESCO", url: "https://www.unesco.org/en/rss.xml", hem: "https://www.unesco.org", kat: "kultur", tillit: 0.92, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "fao", namn: "FAO", url: "https://www.fao.org/feeds/fao-newsroom-rss", hem: "https://www.fao.org", kat: "utrikes", tillit: 0.92, land: "int", typ: "organisation" },
  { id: "eu-kommissionen", namn: "Europeiska kommissionen", url: "https://ec.europa.eu/commission/presscorner/api/rss?language=en", hem: "https://ec.europa.eu", kat: "utrikes", tillit: 0.93, land: "int", typ: "myndighet" },
  { id: "eurostat", namn: "Eurostat", url: "https://ec.europa.eu/eurostat/en/search?p_p_id=estatsearchportlet_WAR_estatsearchportlet&p_p_lifecycle=2&p_p_state=maximized&p_p_mode=view&p_p_resource_id=atom&_estatsearchportlet_WAR_estatsearchportlet_collection=CAT_EURNEW", hem: "https://ec.europa.eu/eurostat", kat: "ekonomi", tillit: 0.97, land: "int", typ: "statistik", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "eea", namn: "Europeiska miljöbyrån (EEA)", url: "https://www.eea.europa.eu/en/newsroom/rss.xml", hem: "https://www.eea.europa.eu", kat: "miljo", tillit: 0.95, land: "int", typ: "myndighet", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "ema", namn: "Europeiska läkemedelsmyndigheten (EMA)", url: "https://www.ema.europa.eu/en/news.xml", hem: "https://www.ema.europa.eu", kat: "halsa", tillit: 0.96, land: "int", typ: "myndighet" },
  { id: "ecdc", namn: "ECDC", url: "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed", hem: "https://www.ecdc.europa.eu", kat: "halsa", tillit: 0.95, land: "int", typ: "myndighet" },
  { id: "iea", namn: "Internationella energiorganet (IEA)", url: "https://www.iea.org/api/rss/news", hem: "https://www.iea.org", kat: "teknik", tillit: 0.93, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "irena", namn: "IRENA", url: "https://www.irena.org/iapi/rssfeed/News", hem: "https://www.irena.org", kat: "miljo", tillit: 0.92, land: "int", typ: "organisation", av: true, orsak: "HTTP 403" },
  { id: "worldbank", namn: "Världsbanken", url: "https://www.worldbank.org/en/news/all?format=rss", hem: "https://www.worldbank.org", kat: "ekonomi", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "gavi", namn: "Gavi, vaccinalliansen", url: "https://www.gavi.org/rss.xml", hem: "https://www.gavi.org", kat: "halsa", tillit: 0.88, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "iucn", namn: "IUCN", url: "https://iucn.org/rss.xml", hem: "https://iucn.org", kat: "djur-natur", tillit: 0.92, land: "int", typ: "organisation", av: true, orsak: "flödet uppdateras inte sedan 2022" },
  { id: "owid", namn: "Our World in Data", url: "https://ourworldindata.org/atom.xml", hem: "https://ourworldindata.org", kat: "vetenskap", tillit: 0.93, land: "int", typ: "statistik" },
  { id: "wmo", namn: "Meteorologiska världsorganisationen (WMO)", url: "https://wmo.int/rss.xml", hem: "https://wmo.int", kat: "miljo", tillit: 0.93, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "nordiska-radet", namn: "Nordiska rådet och Nordiska ministerrådet", url: "https://www.norden.org/sv/rss/news", hem: "https://www.norden.org", kat: "utrikes", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "HTTP 403" },

    { id: "un-press", namn: "FN (pressmeddelanden)", url: "https://press.un.org/en/rss.xml", hem: "https://press.un.org", kat: "utrikes", tillit: 0.9, land: "int", typ: "organisation" },
  { id: "copernicus-klimat", namn: "Copernicus klimattjänst (C3S)", url: "https://climate.copernicus.eu/rss.xml", hem: "https://climate.copernicus.eu", kat: "miljo", tillit: 0.95, land: "int", typ: "myndighet" },
  { id: "copernicus-luft", namn: "Copernicus atmosfärstjänst (CAMS)", url: "https://atmosphere.copernicus.eu/rss.xml", hem: "https://atmosphere.copernicus.eu", kat: "miljo", tillit: 0.95, land: "int", typ: "myndighet" },
  { id: "jrc", namn: "EU:s gemensamma forskningscentrum (JRC)", url: "https://joint-research-centre.ec.europa.eu/node/2/rss_en", hem: "https://joint-research-centre.ec.europa.eu", kat: "vetenskap", tillit: 0.94, land: "int", typ: "myndighet" },

  // ---------- Internationell forskning ----------
  { id: "eurekalert", namn: "EurekAlert! (AAAS, forskningspressmeddelanden)", url: "https://www.eurekalert.org/rss/technology_engineering.xml", hem: "https://www.eurekalert.org", kat: "teknik", tillit: 0.85, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },
  { id: "eurekalert-miljo", namn: "EurekAlert! (miljö)", url: "https://www.eurekalert.org/rss/earth_science.xml", hem: "https://www.eurekalert.org", kat: "miljo", tillit: 0.85, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },
  { id: "eurekalert-medicin", namn: "EurekAlert! (medicin)", url: "https://www.eurekalert.org/rss/medicine_health.xml", hem: "https://www.eurekalert.org", kat: "halsa", tillit: 0.85, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },
  { id: "eurekalert-djur", namn: "EurekAlert! (biologi)", url: "https://www.eurekalert.org/rss/biology.xml", hem: "https://www.eurekalert.org", kat: "djur-natur", tillit: 0.85, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },
  { id: "nih", namn: "NIH (USA:s nationella hälsoinstitut)", url: "https://www.nih.gov/news-releases/feed.xml", hem: "https://www.nih.gov", kat: "halsa", tillit: 0.95, land: "int", typ: "myndighet", av: true, orsak: "robots.txt spärrar / botskydd" },
  { id: "noaa", namn: "NOAA", url: "https://www.noaa.gov/rss.xml", hem: "https://www.noaa.gov", kat: "miljo", tillit: 0.95, land: "int", typ: "myndighet" },
  { id: "usgs", namn: "USGS", url: "https://www.usgs.gov/news/all/feed", hem: "https://www.usgs.gov", kat: "djur-natur", tillit: 0.94, land: "int", typ: "myndighet" },
  { id: "mit", namn: "MIT News", url: "https://news.mit.edu/rss/feed", hem: "https://news.mit.edu", kat: "teknik", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "nus", namn: "National University of Singapore", url: "https://news.nus.edu.sg/feed/", hem: "https://news.nus.edu.sg", kat: "vetenskap", tillit: 0.92, land: "int", typ: "larosate" },
  { id: "kyoto-u", namn: "Kyotos universitet", url: "https://www.kyoto-u.ac.jp/en/rss.xml", hem: "https://www.kyoto-u.ac.jp/en", kat: "vetenskap", tillit: 0.92, land: "int", typ: "larosate" },
  { id: "ecb", namn: "Europeiska centralbanken (ECB)", url: "https://www.ecb.europa.eu/rss/press.html", hem: "https://www.ecb.europa.eu", kat: "ekonomi", tillit: 0.97, land: "int", typ: "myndighet" },
  { id: "wto", namn: "Världshandelsorganisationen (WTO)", url: "https://www.wto.org/library/rss/latest_news_e.xml", hem: "https://www.wto.org", kat: "ekonomi", tillit: 0.9, land: "int", typ: "organisation" },
  { id: "shm", namn: "Statens historiska museer", url: "https://www.shm.se/feed/", hem: "https://www.shm.se", kat: "kultur", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "isof", namn: "Institutet för språk och folkminnen", url: "https://www.isof.se/rss", hem: "https://www.isof.se", kat: "kultur", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "cambridge", namn: "University of Cambridge", url: "https://www.cam.ac.uk/news/feed", hem: "https://www.cam.ac.uk", kat: "vetenskap", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "oxford", namn: "University of Oxford", url: "https://www.ox.ac.uk/news-listing/rss", hem: "https://www.ox.ac.uk", kat: "vetenskap", tillit: 0.93, land: "int", typ: "larosate", av: true, orsak: "robots.txt spärrar flödet" },
  { id: "eth", namn: "ETH Zürich", url: "https://ethz.ch/en/news-und-veranstaltungen/eth-news/news/_jcr_content.feed.html", hem: "https://ethz.ch", kat: "teknik", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "mpg", namn: "Max Planck-sällskapet", url: "https://www.mpg.de/en/research.rss", hem: "https://www.mpg.de", kat: "vetenskap", tillit: 0.94, land: "int", typ: "forskning" },
  { id: "helsinki", namn: "Helsingfors universitet", url: "https://www.helsinki.fi/en/rss.xml", hem: "https://www.helsinki.fi", kat: "vetenskap", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "ku", namn: "Köpenhamns universitet", url: "https://news.ku.dk/all_news/?get_rss=1", hem: "https://news.ku.dk", kat: "vetenskap", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "ntnu", namn: "NTNU och SINTEF (Norwegian SciTech News)", url: "https://norwegianscitechnews.com/feed/", hem: "https://norwegianscitechnews.com", kat: "teknik", tillit: 0.93, land: "int", typ: "larosate" },
  { id: "nhm", namn: "Natural History Museum, London", url: "https://www.nhm.ac.uk/discover/news.rss.xml", hem: "https://www.nhm.ac.uk", kat: "djur-natur", tillit: 0.92, land: "int", typ: "forskning", av: true, orsak: "inget flöde" },
  { id: "zsl", namn: "ZSL (Zoological Society of London)", url: "https://www.zsl.org/news-and-events/news/rss.xml", hem: "https://www.zsl.org", kat: "djur-natur", tillit: 0.9, land: "int", typ: "organisation", av: true, orsak: "HTTP 403" },
  { id: "rewilding", namn: "Rewilding Europe", url: "https://rewildingeurope.com/feed/", hem: "https://rewildingeurope.com", kat: "djur-natur", tillit: 0.85, land: "int", typ: "organisation" },
  { id: "birdlife", namn: "BirdLife International", url: "https://www.birdlife.org/feed/", hem: "https://www.birdlife.org", kat: "djur-natur", tillit: 0.88, land: "int", typ: "organisation" },
  { id: "ocean-conservancy", namn: "Ocean Conservancy", url: "https://oceanconservancy.org/feed/", hem: "https://oceanconservancy.org", kat: "djur-natur", tillit: 0.8, land: "int", typ: "organisation" },
  { id: "wwf-se", namn: "WWF Sverige", url: "https://www.wwf.se/feed/", hem: "https://www.wwf.se", kat: "djur-natur", tillit: 0.82, land: "se", typ: "organisation" },
  { id: "naturskydd", namn: "Naturskyddsföreningen", url: "https://via.tt.se/rss/releases/latest?publisherId=3236031", hem: "https://www.naturskyddsforeningen.se", kat: "miljo", tillit: 0.8, land: "se", typ: "organisation" },
  { id: "cancerfonden", namn: "Cancerfonden", url: "https://via.tt.se/rss/releases/latest?publisherId=3236459", hem: "https://www.cancerfonden.se", kat: "halsa", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "hjart-lung", namn: "Hjärt-Lungfonden", url: "https://www.mynewsdesk.com/se/rss/current_news/4956", hem: "https://www.hjart-lungfonden.se", kat: "halsa", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "nordens-ark", namn: "Nordens Ark", url: "https://www.mynewsdesk.com/se/nordens_ark/rss/pressreleases", hem: "https://nordensark.se", kat: "djur-natur", tillit: 0.85, land: "se", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "kolmarden", namn: "Kolmården", url: "https://www.mynewsdesk.com/se/rss/current_news/5218", hem: "https://www.kolmarden.com", kat: "djur-natur", tillit: 0.75, land: "se", typ: "foretag" },
  { id: "skansen", namn: "Skansen", url: "https://via.tt.se/rss/releases/latest?publisherId=303403", hem: "https://www.skansen.se", kat: "djur-natur", tillit: 0.8, land: "se", typ: "organisation" },
  { id: "nationalmuseum", namn: "Nationalmuseum", url: "https://www.mynewsdesk.com/se/rss/current_news/87", hem: "https://www.nationalmuseum.se", kat: "kultur", tillit: 0.9, land: "se", typ: "myndighet" },
  { id: "sfi", namn: "Svenska Filminstitutet", url: "https://www.filminstitutet.se/sv/rss/nyheter/", hem: "https://www.filminstitutet.se", kat: "kultur", tillit: 0.9, land: "se", typ: "organisation", av: true, orsak: "inget flöde" },
  { id: "europeana", namn: "Europeana", url: "https://www.europeana.eu/en/blog/rss", hem: "https://www.europeana.eu", kat: "kultur", tillit: 0.85, land: "int", typ: "organisation", av: true, orsak: "inget flöde" },
  // ---------- Människor som gör fina saker, natur som kommer tillbaka, framsteg (tillagda 2026-11-26) ----------
  { id: "raddabarnen", namn: "Rädda Barnen", url: "https://press.raddabarnen.se/rss/current_news/5399", hem: "https://www.raddabarnen.se", kat: "inrikes", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "sjoraddning", namn: "Sjöräddningssällskapet", url: "https://www.mynewsdesk.com/se/rss/current_news/11177", hem: "https://www.sjoraddning.se", kat: "inrikes", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "livraddning", namn: "Svenska Livräddningssällskapet", url: "https://www.mynewsdesk.com/se/rss/current_news/5301", hem: "https://www.svenskalivraddningssallskapet.se", kat: "inrikes", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "rodakorset", namn: "Svenska Röda Korset", url: "https://via.tt.se/rss/releases/latest?publisherId=3235745", hem: "https://www.rodakorset.se", kat: "inrikes", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "stadsmissionerna", namn: "Sveriges Stadsmissioner", url: "https://www.mynewsdesk.com/se/rss/current_news/126180", hem: "https://www.stadsmissionen.se", kat: "inrikes", tillit: 0.82, land: "se", typ: "organisation" },
  { id: "barncancerfonden", namn: "Barncancerfonden", url: "https://www.mynewsdesk.com/se/rss/current_news/125226", hem: "https://www.barncancerfonden.se", kat: "halsa", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "hjartebarnsfonden", namn: "Hjärtebarnsfonden", url: "https://www.mynewsdesk.com/se/rss/current_news/28330", hem: "https://www.hjartebarnsfonden.se", kat: "halsa", tillit: 0.82, land: "se", typ: "organisation" },
  { id: "geblod", namn: "GeBlod", url: "https://geblod.nu/feed/", hem: "https://geblod.nu", kat: "halsa", tillit: 0.85, land: "se", typ: "organisation" },
  { id: "mentor", namn: "Mentor Sverige", url: "https://mentor.se/feed/", hem: "https://mentor.se", kat: "inrikes", tillit: 0.8, land: "se", typ: "organisation" },
  { id: "unicef-se", namn: "UNICEF Sverige", url: "https://via.tt.se/rss/releases/latest?publisherId=3242049", hem: "https://unicef.se", kat: "utrikes", tillit: 0.88, land: "se", typ: "organisation" },
  { id: "artdatabanken", namn: "SLU Artdatabanken", url: "https://www.slu.se/artdatabanken/arter-och-natur/artiklar/rss?id=31569", hem: "https://www.slu.se/artdatabanken/", kat: "djur-natur", tillit: 0.95, land: "se", typ: "larosate" },
  { id: "lansstyrelsen-stockholm", namn: "Länsstyrelsen Stockholm", url: "https://www.lansstyrelsen.se/api/getnews?whichlst=Stockholm&local=3.710ed317161746d8052c682&type=rss&state=rss&sv.contenttype=text/xml;charset=UTF-8", hem: "https://www.lansstyrelsen.se/stockholm.html", kat: "inrikes", tillit: 0.93, land: "se", typ: "myndighet" },
  { id: "rewild", namn: "Re:wild", url: "https://www.rewild.org/feed", hem: "https://www.rewild.org", kat: "djur-natur", tillit: 0.85, land: "int", typ: "organisation" },
  { id: "ember", namn: "Ember (energitankesmedja)", url: "https://ember-energy.org/feed/?post_type=insight_page", hem: "https://ember-energy.org", kat: "miljo", tillit: 0.88, land: "int", typ: "forskning" },
  { id: "gates", namn: "Gates Foundation", url: "https://www.gatesfoundation.org/feed", hem: "https://www.gatesfoundation.org", kat: "halsa", tillit: 0.85, land: "int", typ: "organisation" },
  { id: "malaria-consortium", namn: "Malaria Consortium", url: "https://www.malariaconsortium.org/feeds/news.xml", hem: "https://www.malariaconsortium.org", kat: "halsa", tillit: 0.85, land: "int", typ: "organisation" },

  // ---------- Etablerade medier och goda nyheter-medier (tillagda 2026-11-26) ----------
  // Tipskällor med lägre tillit. Villkor och robots.txt provade 2026-11-26. Medier som blockerar automatisk eller
  // AI-baserad läsning, eller vars villkor bara tillåter personligt, icke-kommersiellt bruk, är avstängda med orsak.
  { id: "svt-vetenskap", namn: "SVT Nyheter – Vetenskap", kortnamn: "SVT", url: "https://www.svt.se/nyheter/vetenskap/rss.xml", hem: "https://www.svt.se", kat: "vetenskap", tillit: 0.8, land: "se", typ: "medium" },
  { id: "goodgoodgood", namn: "Good Good Good", kortnamn: "Good Good Good", url: "https://www.goodgoodgood.co/articles/rss.xml", hem: "https://www.goodgoodgood.co", kat: "utrikes", tillit: 0.65, land: "int", typ: "medium" },
  { id: "goodnewsnetwork", namn: "Good News Network", kortnamn: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", hem: "https://www.goodnewsnetwork.org", kat: "utrikes", tillit: 0.6, land: "int", typ: "medium" },
  { id: "optimistdaily", namn: "The Optimist Daily", kortnamn: "The Optimist Daily", url: "https://www.optimistdaily.com/feed/", hem: "https://www.optimistdaily.com", kat: "utrikes", tillit: 0.6, land: "int", typ: "medium" },
  { id: "positivenews", namn: "Positive News", url: "https://www.positive.news/feed/", hem: "https://www.positive.news", kat: "utrikes", tillit: 0.65, land: "int", typ: "medium", av: true, orsak: "villkoren: bara personligt, icke-kommersiellt bruk, ingen automatisk läsning" },
  { id: "rtbc", namn: "Reasons to be Cheerful", url: "https://reasonstobecheerful.world/feed/", hem: "https://reasonstobecheerful.world", kat: "utrikes", tillit: 0.65, land: "int", typ: "medium", av: true, orsak: "robots.txt blockerar AI-baserad läsning" },
  { id: "theconversation", namn: "The Conversation", url: "https://theconversation.com/global/articles.atom", hem: "https://theconversation.com", kat: "vetenskap", tillit: 0.7, land: "int", typ: "medium", av: true, orsak: "robots.txt blockerar AI-baserad läsning; CC BY-ND" },
  { id: "fixthenews", namn: "Fix the News", url: "https://fixthenews.com/feed", hem: "https://fixthenews.com", kat: "utrikes", tillit: 0.6, land: "int", typ: "medium", av: true, orsak: "robots.txt blockerar AI-baserad läsning; sammanfattningar bara för personligt bruk" },
  { id: "mongabay", namn: "Mongabay", url: "https://news.mongabay.com/feed", hem: "https://news.mongabay.com", kat: "djur-natur", tillit: 0.7, land: "int", typ: "medium", av: true, orsak: "villkoren: bara personligt, icke-kommersiellt bruk" },
  { id: "anthropocene", namn: "Anthropocene Magazine", url: "https://www.anthropocenemagazine.org/feed/", hem: "https://www.anthropocenemagazine.org", kat: "miljo", tillit: 0.7, land: "int", typ: "medium", av: true, orsak: "robots.txt svarar inte (räknas som nej); återanvändning kräver tillstånd" },
  { id: "euronews-earth", namn: "Euronews", url: "https://www.euronews.com/rss?level=vertical&name=earth", hem: "https://www.euronews.com", kat: "miljo", tillit: 0.7, land: "int", typ: "medium", av: true, orsak: "villkoren: bara personligt, icke-kommersiellt bruk" },
  { id: "sr-ekot", namn: "Sveriges Radio Ekot", url: "https://api.sr.se/api/rss/program/83", hem: "https://sverigesradio.se", kat: "inrikes", tillit: 0.8, land: "se", typ: "medium", av: true, orsak: "API-villkoren: bara länkning; robots.txt blockerar AI-baserad läsning" },
  { id: "guardian", namn: "The Guardian", url: "https://www.theguardian.com/world/series/the-upside/rss", hem: "https://www.theguardian.com", kat: "utrikes", tillit: 0.8, land: "int", typ: "medium", av: true, orsak: "flöden bara för personligt bruk; robots.txt förbjuder AI och kommersiellt bruk" },
  { id: "bbc", namn: "BBC News", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", hem: "https://www.bbc.com", kat: "utrikes", tillit: 0.8, land: "int", typ: "medium", av: true, orsak: "kommersiellt bruk av flödena kräver tillstånd; förbjuder AI-sammanfattningar" },
  { id: "npr", namn: "NPR", url: "https://feeds.npr.org/1001/rss.xml", hem: "https://www.npr.org", kat: "utrikes", tillit: 0.8, land: "int", typ: "medium", av: true, orsak: "flödet: For Personal Use Only" },
];

/** Källor som får användas: allt utom avstängda. */
export const AKTIVA = KALLOR.filter((k) => !k.av);
