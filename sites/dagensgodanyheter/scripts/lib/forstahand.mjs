// Spårar förstahandskällan bakom en mediekällas nyhet: studien, organisationen eller myndigheten som mediet
// bygger på. Används av skriv.mjs för källor med typ "medium".
//
// Hittas en förstahandskälla skrivs artikeln utifrån den och länkar både den och mediet. Hittas ingen skrivs
// artikeln som "enligt [medium]" och länkar mediets artikel (kontrolleras med enligtFel nedan).
import { avkoda } from "./natet.mjs";

/** Artikelns HTML-område: <article>/<main> om de finns och har innehåll, annars <body>. */
export function huvudhtml(html) {
  const s = String(html);
  for (const re of [/<article[\s\S]*?<\/article>/i, /<main[\s\S]*?<\/main>/i, /<body[\s\S]*<\/body>/i]) {
    const m = s.match(re);
    if (m && m[0].replace(/<[^>]+>/g, "").trim().length > 400) return m[0];
  }
  return s;
}

const vard = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const slutarPa = (host, doman) => host === doman || host.endsWith(`.${doman}`);

// Vetenskapliga tidskrifter, förlag, förhandspubliceringar och forskningsnyhetstjänster (lärosätenas egna
// pressmeddelanden). Starkast belägg för vad som faktiskt har kommit fram.
const STUDIER = ["doi.org", "nature.com", "science.org", "cell.com", "thelancet.com", "nejm.org", "pnas.org", "plos.org", "bmj.com",
  "springer.com", "link.springer.com", "wiley.com", "sciencedirect.com", "frontiersin.org", "mdpi.com", "biorxiv.org", "medrxiv.org",
  "arxiv.org", "eurekalert.org", "jamanetwork.com", "academic.oup.com", "royalsocietypublishing.org", "iopscience.iop.org",
  "tandfonline.com", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "cambridge.org", "elifesciences.org", "acs.org", "agu.org"];
// Stora organ och databaser med egna data och rapporter – starka källor, men studien själv går före.
const ORGAN = ["esa.int", "nasa.gov", "who.int", "un.org", "unep.org", "iea.org", "irena.org", "worldbank.org", "ourworldindata.org", "iucn.org", "iucnredlist.org"];
// Myndigheter, lärosäten och mellanstatliga organisationer (toppdomäner och kända svenska lärosäten/myndigheter).
const MYNDIGHET = /\.(gov|gov\.[a-z]{2}|mil|edu|edu\.[a-z]{2}|ac\.[a-z]{2}|int|europa\.eu|gc\.ca|gouv\.fr|bund\.de|govt\.nz)$/;
const SVENSKA = ["regeringen.se", "riksdagen.se", "scb.se", "smhi.se", "naturvardsverket.se", "folkhalsomyndigheten.se", "ki.se", "lu.se",
  "uu.se", "su.se", "gu.se", "kth.se", "chalmers.se", "slu.se", "umu.se", "liu.se", "ltu.se", "lnu.se", "oru.se", "mau.se", "miun.se",
  "kau.se", "his.se", "mdu.se", "vr.se", "vinnova.se", "energimyndigheten.se", "havochvatten.se", "skogsstyrelsen.se", "lansstyrelsen.se",
  "artdatabanken.se", "socialstyrelsen.se", "lakemedelsverket.se", "rymdstyrelsen.se", "polarforskningssekretariatet.se"];
// Länkar som aldrig är förstahandskällan: sociala medier, andra nyhetsmedier, nyhetsbyråer, butiker, delning.
const ALDRIG = ["twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com", "youtu.be", "linkedin.com", "tiktok.com",
  "bsky.app", "threads.net", "reddit.com", "pinterest.com", "whatsapp.com", "t.me", "mastodon.social", "amazon.com", "bit.ly",
  "nytimes.com", "washingtonpost.com", "cnn.com", "bbc.co.uk", "bbc.com", "theguardian.com", "reuters.com", "apnews.com", "afp.com",
  "bloomberg.com", "ft.com", "wsj.com", "economist.com", "forbes.com", "businessinsider.com", "huffpost.com", "dailymail.co.uk",
  "independent.co.uk", "telegraph.co.uk", "npr.org", "cbsnews.com", "nbcnews.com", "abcnews.go.com", "foxnews.com", "time.com",
  "newsweek.com", "usatoday.com", "theatlantic.com", "vox.com", "axios.com", "politico.com", "aljazeera.com", "euronews.com",
  "dn.se", "svd.se", "aftonbladet.se", "expressen.se", "gp.se", "sydsvenskan.se", "svt.se", "sverigesradio.se", "tt.se", "omni.se",
  "positive.news", "goodnewsnetwork.org", "goodgoodgood.co", "reasonstobecheerful.world", "optimistdaily.com", "fixthe.news",
  "mongabay.com", "anthropocenemagazine.org", "theconversation.com", "wikipedia.org", "google.com", "apple.com", "spotify.com",
  "substack.com", "medium.com", "patreon.com", "gofundme.com", "eventbrite.com", "mailchimp.com", "list-manage.com", "feedburner.com",
  "cookiedatabase.org", "cookiebot.com", "onetrust.com", "iubenda.com", "wordpress.org", "creativecommons.org", "fixthenews.com"];
const SKRAP = /\/(tag|tags|author|authors|category|categories|topic|topics|subscribe|newsletter|donate|support-us|login|signin|account|cart|shop|privacy|terms|cookie|consent|gdpr|tcf|about|contact|jobs|careers|advertis)/i;

/**
 * Text från en nyhetsbyrå (TT, AFP, Reuters, AP, NTB, Ritzau) i ett mediums artikel. Byråernas villkor förbjuder
 * återanvändning, så sådana artiklar hoppas över.
 */
export const BYRA = /\((TT|AFP|Reuters|AP|NTB|Ritzau)\)|\b(TT|AFP|Reuters|NTB)\s*\/\s*[A-ZÅÄÖ]|\b([Tt]ext|TEXT|[Kk]älla)\s*:\s*(TT|AFP|Reuters|AP|NTB)\b|(^|\n)\s*(TT|AFP|Reuters)\s*(\n|$)|\bTT Nyhetsbyrån\b|\bAssociated Press\b/;

/**
 * Länkar i artikeltexten som troligen är förstahandskällan, bäst först. Mediets egen domän och domäner i
 * `utesluten` räknas aldrig. Varje länk får en poäng: 3 studie/tidskrift/forskningsnyhet, 2,5 stort organ (NASA, WHO, IUCN …), 2 myndighet/lärosäte,
 * 1 annan organisation (.org/.se/.eu m.fl.). Övriga länkar tas inte med.
 */
export function troligaKallor(html, sidUrl, { utesluten = [] } = {}) {
  const egen = vard(sidUrl);
  const ute = [egen, ...utesluten.map((u) => (u.includes("/") ? vard(u) : u.replace(/^www\./, "")))].filter(Boolean);
  const sedda = new Map();
  for (const m of huvudhtml(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(avkoda(m[1]), sidUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (ute.some((d) => slutarPa(host, d) || slutarPa(d, host))) continue;
    if (ALDRIG.some((d) => slutarPa(host, d))) continue;
    if (SKRAP.test(url.pathname) || /\.(pdf|jpe?g|png|gif|webp|mp4|mp3|zip|docx?|xlsx?)$/i.test(url.pathname)) continue;
    if (url.pathname.replace(/\/+$/, "") === "") continue; // bara en startsida säger inget om nyheten
    const bas = STUDIER.some((d) => slutarPa(host, d)) ? 3
      : ORGAN.some((d) => slutarPa(host, d)) ? 2.5
      : MYNDIGHET.test(host) || SVENSKA.some((d) => slutarPa(host, d)) ? 2
        : /\.(org|se|eu|no|dk|fi|de|nl|fr|ch|ca|au|nz)$/.test(host) ? 1 : 0;
    if (!bas) continue;
    url.hash = "";
    for (const p of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) url.searchParams.delete(p);
    const href = url.toString();
    const text = avkoda(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    // Länktexter som "the study", "published in", "report" pekar oftast på just källan bakom nyheten.
    const poang = bas + (/\b(study|studie|studien|research|forskning|journal|published|publicerad|report|rapport|paper|press release|pressmeddelande|findings|survey|data)\b/i.test(text) ? 0.5 : 0);
    const f = sedda.get(href);
    if (f) f.antal++;
    else sedda.set(href, { url: href, host, poang, text, antal: 1, ordning: sedda.size });
  }
  return [...sedda.values()].sort((a, b) => b.poang - a.poang || b.antal - a.antal || a.ordning - b.ordning);
}

/** Visningsnamn och rubrik för en hämtad förstahandssida: og:site_name/og:title, annars <title> och domänen. */
export function sidinfo(html, url) {
  const s = String(html);
  const meta = (namn) => {
    const m = s.match(new RegExp(`<meta[^>]+(?:property|name)=["']${namn}["'][^>]*content=["']([^"']+)["']`, "i"))
      ?? s.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${namn}["']`, "i"));
    return m ? avkoda(m[1]).trim() : "";
  };
  const titel = meta("og:title") || avkoda((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ")).trim();
  const host = vard(url);
  const namn = meta("og:site_name") || host;
  let hem = "";
  try { hem = new URL(url).origin; } catch { /* ogiltig adress */ }
  return { namn: namn.slice(0, 80), rubrik: titel.slice(0, 200), hem };
}

const norm = (t) => String(t ?? "").toLowerCase().replace(/[^a-zåäöéü0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Utan förstahandskälla ska artikeln säga varifrån uppgifterna kommer: "enligt [medium]" i ingressen eller första
 * avsnittet. Returnerar ett fel, eller null.
 */
export function enligtFel(a, mediumNamn) {
  const borjan = norm([a.ingress, ...(a.avsnitt?.[0]?.stycken ?? [])].join(" "));
  const namn = norm(mediumNamn).replace(/^the /, "");
  return new RegExp(`\\benligt (the )?${namn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(borjan)
    ? null
    : `artikeln saknar "enligt ${mediumNamn}" i ingressen eller första avsnittet`;
}
