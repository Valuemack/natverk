// Trender som idékälla: vad människor söker på och läser om just nu. Körs varje natt före poängsättningen.
//
//   node scripts/trender.mjs            # hämtar trender, klassar dem och skriver data/trender/YYYY-MM-DD.json
//   node scripts/trender.mjs --utan-ai  # utan Claude: negativa trender sorteras bort med ordlistan i poang.mjs
//
// Källor (högst ett anrop per sekund och värd, robots.txt följs, generisk User-Agent – se lib/natet.mjs):
//   - Google Trends dagliga RSS (https://trends.google.com/trending/rss?geo=XX) för Sverige och ett urval länder.
//   - Wikipedias mest lästa artiklar på svenska och engelska föregående dygn (Wikimedias REST-API, /metrics/pageviews/top/).
//   - Google Ads Keyword Planner – bara om GOOGLE_ADS_*-variablerna finns (se nyckelordsplanerare() nedan).
//
// Hur trenderna används (scripts/hamta.mjs): en kandidat från våra förstahandskällor som handlar om ett trendande
// ämne får en aktualitetsbonus (högst 5 poäng av 100, src/lib/vikter.js). Ett enkelt ordfilter föreslår möjliga
// trender, och den billiga modellen avgör i poängsättningen om nyheten verkligen handlar om samma sak.
// Regler: en trend räcker ALDRIG ensam för en artikel – det krävs alltid en förstahandskälla. Negativa trender
// (brott, olyckor, krig, dödsfall, katastrofer) används inte alls.
//
// Idéloggen data/trender/YYYY-MM-DD.json listar dagens trender, hur de klassades och vilka kandidater de matchade
// (fylls på av hamta.mjs). Den checkas in av nattbygget så att ägaren kan läsa den.
//
// ---------- Google Ads Keyword Planner (förberett, inte aktiverat) ----------
// Sökvolymer per sökord kräver Google Ads API. Ägaren behöver:
//   1. Ett Google Ads-konto (ett "manager"-konto, MCC, rekommenderas) – det behöver inte ha aktiva annonser.
//   2. En developer token: Google Ads → Verktyg → API Center. Ansök om "Basic access" (test access räcker inte
//      för riktiga sökvolymer). Ansökan granskas av Google och kan ta några dagar.
//   3. Ett OAuth-klient-ID (typ "Desktop" eller "Web") i Google Cloud Console, med Google Ads API aktiverat.
//   4. En refresh token för kontot (skapas en gång med OAuth-flödet, t.ex. Googles exempel "generate_user_credentials").
// Lägg sedan in som GitHub-secrets (och i natverk/.env lokalt):
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_CUSTOMER_ID (kontot utan bindestreck), valfritt GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC-kontot) och
//   GOOGLE_ADS_API_VERSION (t.ex. "v22" – den aktuella versionen enligt Googles dokumentation).
// Saknas någon av de obligatoriska hoppas steget över. Anropet är skrivet efter API:ts REST-dokumentation men har
// inte kunnat provas utan konto; första körningen med nycklar bör kontrolleras i idéloggen.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hamta, avkoda } from "./lib/natet.mjs";
import { laddaEnv } from "./lib/env.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TREND_DIR = join(ROT, "data", "trender");

/** Länder för Google Trends: Sverige för Inrikes, resten för Utrikes och globala ämnen. */
export const LANDER = ["SE", "US", "GB", "IN", "AU", "CA", "ZA", "NG", "KE", "BR", "JP", "DE"];
const WIKI = ["sv", "en"];

const dagIso = (d) => d.toISOString().slice(0, 10);
export const trendFil = (dag) => join(TREND_DIR, `${dag}.json`);

// ---------- hämtning ----------
const tagg = (xml, namn) => (xml.match(new RegExp(`<${namn}(?:\\s[^>]*)?>([\\s\\S]*?)</${namn}>`, "i")) || [])[1] ?? "";
const ren = (s) => avkoda(String(s).replace(/<!\[CDATA\[|\]\]>/g, "")).trim();

export function tolkaTrendRss(xml, land) {
  return (String(xml).match(/<item>[\s\S]*?<\/item>/gi) ?? []).map((post) => ({
    term: ren(tagg(post, "title")),
    kalla: `google-${land}`,
    trafik: ren(tagg(post, "ht:approx_traffic")),
    nyheter: (post.match(/<ht:news_item>[\s\S]*?<\/ht:news_item>/gi) ?? []).map((n) => ren(tagg(n, "ht:news_item_title"))).filter(Boolean).slice(0, 3),
  })).filter((t) => t.term);
}

async function googleTrends() {
  const ut = [], status = [];
  for (const land of LANDER) {
    try {
      const r = await hamta(`https://trends.google.com/trending/rss?geo=${land}`, { accept: "application/rss+xml, application/xml" });
      const t = tolkaTrendRss(r.data, land);
      ut.push(...t);
      status.push({ kalla: `google-${land}`, antal: t.length });
    } catch (e) { status.push({ kalla: `google-${land}`, fel: e.message }); }
  }
  return { ut, status };
}

// Sidor som alltid toppar och inte säger något om dagens ämnen.
const WIKI_BRUS = /^(Huvudsida|Main_Page|Special:|Wikipedia:|Portal:|Fil:|File:|Kategori:|Category:|Hjälp:|Help:|-$|Xxx|Cleopatra|Undefined)/i;

async function wikipedia(nu) {
  const ut = [], status = [];
  for (const sprak of WIKI) {
    let ok = false;
    // Gårdagens siffror publiceras några timmar efter midnatt (UTC); finns de inte än tas dagen före.
    for (const dagarBak of [1, 2]) {
      const d = new Date(nu - dagarBak * 864e5);
      const [y, m, dd] = dagIso(d).split("-");
      try {
        const r = await hamta(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${sprak}.wikipedia/all-access/${y}/${m}/${dd}`, { accept: "application/json" });
        const lista = JSON.parse(r.data)?.items?.[0]?.articles ?? [];
        const t = lista.filter((a) => !WIKI_BRUS.test(a.article)).slice(0, 40).map((a) => ({ term: a.article.replace(/_/g, " "), kalla: `wikipedia-${sprak}`, visningar: a.views, dag: `${y}-${m}-${dd}` }));
        ut.push(...t);
        status.push({ kalla: `wikipedia-${sprak}`, dag: `${y}-${m}-${dd}`, antal: t.length });
        ok = true;
        break;
      } catch (e) { if (dagarBak === 2) status.push({ kalla: `wikipedia-${sprak}`, fel: e.message }); }
    }
    if (!ok) continue;
  }
  return { ut, status };
}

/** Google Ads Keyword Planner: sökordsidéer med månadsvolym för Sverige. Hoppas över om nycklarna saknas. */
export async function nyckelordsplanerare(fron) {
  const KRAV = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_API_VERSION"];
  const saknas = KRAV.filter((k) => !process.env[k]);
  if (saknas.length) return { status: "hoppad", saknas };
  try {
    // Autentiserat API (inte en webbsida): anropas direkt, utan robots.txt-kontrollen i hamta().
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: "refresh_token" }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error("ingen access token (kontrollera OAuth-uppgifterna)");
    const kund = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "");
    const svar = await fetch(`https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION}/customers/${kund}:generateKeywordIdeas`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN, "Content-Type": "application/json",
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID && { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "") }),
      },
      // Sverige (geoTargetConstants/2752), svenska (languageConstants/1015), Google Sök.
      body: JSON.stringify({ language: "languageConstants/1015", geoTargetConstants: ["geoTargetConstants/2752"], keywordPlanNetwork: "GOOGLE_SEARCH", keywordSeed: { keywords: fron.slice(0, 20) } }),
    });
    if (!svar.ok) throw new Error(`Google Ads API svarade ${svar.status}`);
    const json = await svar.json();
    const ideer = (json.results ?? []).map((r) => ({ sokord: r.text, manadsvolym: Number(r.keywordIdeaMetrics?.avgMonthlySearches ?? 0) })).sort((a, b) => b.manadsvolym - a.manadsvolym).slice(0, 100);
    return { status: "ok", antal: ideer.length, ideer };
  } catch (e) {
    return { status: "fel", fel: String(e.message || e) };
  }
}

// ---------- klassning ----------
const KLASS_SYSTEM = `Du sorterar trendande sökord och Wikipedia-artiklar åt en svensk sajt med enbart positiva nyheter.
För varje post, svara:
- ton: "negativ" om ämnet främst handlar om brott, våld, olyckor, krig, terror, dödsfall, sjukdomsutbrott, katastrofer, skandaler eller kriser; "positiv" om det handlar om framsteg, upptäckter, natur, rymden, hälsa som förbättras eller liknande; annars "neutral" (sport, nöje, kändisar, högtider, väder, produkter).
- amne: ämnet på svenska i 1–4 ord.
- nyckelord: 1–5 specifika ord eller namn (på svenska och/eller engelska) som en nyhet om just den här saken skulle innehålla – egennamn, organisationer, uppdrag, arter, tekniker, platser som är själva ämnet. Inga årtal, månader, länder eller allmänna ord som "svensk", "historia", "storm", "news".`;
const KLASS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["poster"],
  properties: { poster: { type: "array", items: { type: "object", additionalProperties: false, required: ["nr", "ton", "amne", "nyckelord"], properties: { nr: { type: "integer" }, ton: { type: "string", enum: ["positiv", "neutral", "negativ"] }, amne: { type: "string" }, nyckelord: { type: "array", items: { type: "string" } } } } } },
};

async function klassaMedAi(trender) {
  const { jsonAnrop, MODELL_POANG } = await import("./lib/claude.mjs");
  let kostnad = 0;
  for (let i = 0; i < trender.length; i += 60) {
    const del = trender.slice(i, i + 60);
    const text = del.map((t, j) => `#${j + 1} ${t.term}${t.nyheter?.length ? ` (rubriker: ${t.nyheter.join(" | ")})` : ""}`).join("\n");
    const svar = await jsonAnrop({ modell: MODELL_POANG, system: KLASS_SYSTEM, text, schema: KLASS_SCHEMA, effort: "low", maxTokens: 8000 });
    kostnad += svar.kostnad;
    for (const p of svar.data.poster ?? []) {
      const t = del[p.nr - 1];
      if (t) Object.assign(t, { ton: p.ton, amne: p.amne, nyckelord: (p.nyckelord ?? []).slice(0, 5) });
    }
  }
  return kostnad;
}

async function klassaUtanAi(trender) {
  const { heuristik } = await import("./lib/poang.mjs");
  for (const t of trender) {
    const h = heuristik({ titel: t.term, sammanfattning: (t.nyheter ?? []).join(" "), datum: null }, { tillit: 0.8 });
    t.ton = h.positiv < 0.4 ? "negativ" : "neutral";
    t.amne = t.term;
    t.nyckelord = [t.term];
  }
}

// ---------- matchning (används av hamta.mjs) ----------
const norm = (s) => ` ${String(s).toLowerCase().normalize("NFC").replace(/[^a-zåäöéüæøñ0-9]+/g, " ").trim()} `;

/** Dagens (eller gårdagens) trendlogg, eller null. */
export function laddaTrender(nu = Date.now()) {
  for (const dagarBak of [0, 1]) {
    const f = trendFil(dagIso(new Date(nu - dagarBak * 864e5)));
    if (existsSync(f)) return { fil: f, logg: JSON.parse(readFileSync(f, "utf8")) };
  }
  return null;
}

/** Användbara trender: allt utom negativa. */
export const anvandbara = (logg) => (logg?.trender ?? []).filter((t) => t.ton && t.ton !== "negativ");

// Ord som säger för lite för att koppla en nyhet till en trend.
const MANADER = "januari februari mars april maj juni juli augusti september oktober november december january february march may june july august october";
const ALLMANT = new Set(`${MANADER} måndag tisdag onsdag torsdag fredag lördag söndag monday tuesday wednesday thursday friday saturday sunday
  sverige sweden svensk svenska swedish world världen news nyheter update today idag vecka week året year historia history
  regering government storm väder weather artist sport match final live video`.split(/\s+/).filter(Boolean));

const nycklarFor = (t) => [t.term, ...(t.nyckelord ?? [])]
  .map((k) => norm(k).trim())
  .filter((k) => k.length >= 4 && !/^[0-9 ]+$/.test(k) && !ALLMANT.has(k));

/**
 * Nyckelord som träffar så många av dagens kandidater att de inte pekar ut någon särskild nyhet
 * (fler än 3 kandidater eller 2 procent av dem). De används inte för matchning.
 */
export function allmannaNycklar(kandidater, trender) {
  const texter = kandidater.map((c) => norm(`${c.titel} ${c.sammanfattning ?? ""}`));
  const grans = Math.max(3, Math.ceil(kandidater.length * 0.02));
  const ut = new Set();
  for (const k of new Set(trender.flatMap(nycklarFor))) {
    let n = 0;
    for (const t of texter) if (t.includes(` ${k} `) && ++n > grans) { ut.add(k); break; }
  }
  return ut;
}

/**
 * Möjliga trender för en kandidat: ett ordfilter på trendens term och nyckelord (hela ord, minst fyra tecken,
 * inga årtal, månader eller allmänna ord). Bara ett förslag – den billiga modellen avgör i poängsättningen om
 * nyheten verkligen handlar om samma sak.
 */
export function mojligaTrender(kandidat, trender, { max = 3, ignorera = new Set() } = {}) {
  const text = norm(`${kandidat.titel} ${kandidat.sammanfattning ?? ""}`);
  const traffar = [];
  for (const t of trender) {
    if (nycklarFor(t).some((k) => !ignorera.has(k) && text.includes(` ${k} `)) && !traffar.includes(t.term)) traffar.push(t.term);
    if (traffar.length >= max) break;
  }
  return traffar;
}

// ---------- körning ----------
async function kor() {
  laddaEnv();
  const nu = Date.now();
  const utanAi = process.argv.includes("--utan-ai") || !process.env.ANTHROPIC_API_KEY;
  const g = await googleTrends();
  const w = await wikipedia(nu);
  // Samma term från flera källor slås ihop.
  const perTerm = new Map();
  for (const t of [...g.ut, ...w.ut]) {
    const k = t.term.toLowerCase();
    if (perTerm.has(k)) { const f = perTerm.get(k); f.kallor.push(t.kalla); f.nyheter = [...new Set([...(f.nyheter ?? []), ...(t.nyheter ?? [])])].slice(0, 3); continue; }
    perTerm.set(k, { term: t.term, kallor: [t.kalla], ...(t.trafik && { trafik: t.trafik }), ...(t.visningar && { visningar: t.visningar }), ...(t.nyheter?.length && { nyheter: t.nyheter }) });
  }
  const trender = [...perTerm.values()];
  let kostnad = 0;
  if (utanAi) await klassaUtanAi(trender);
  else kostnad = await klassaMedAi(trender).catch(async (e) => { console.warn(`Klassningen misslyckades (${e.message}), ordlistan används.`); await klassaUtanAi(trender); return 0; });

  // Fröord för Keyword Planner: ämneshubbarna och dagens positiva trender.
  const { AMNESHUBBAR } = await import("../src/lib/amnen.js");
  const fron = [...AMNESHUBBAR.map((h) => h.namn), ...trender.filter((t) => t.ton === "positiv").map((t) => t.amne)];
  const ads = await nyckelordsplanerare(fron);

  const dag = dagIso(new Date(nu));
  mkdirSync(TREND_DIR, { recursive: true });
  const logg = {
    skapad: new Date(nu).toISOString(),
    klassning: utanAi ? "ordlista" : "claude-haiku-5-5",
    kostnadUSD: Math.round(kostnad * 10000) / 10000,
    kallor: [...g.status, ...w.status],
    nyckelordsplanerare: ads,
    sammanfattning: { totalt: trender.length, positiva: trender.filter((t) => t.ton === "positiv").length, neutrala: trender.filter((t) => t.ton === "neutral").length, negativa_bortsorterade: trender.filter((t) => t.ton === "negativ").length },
    trender: trender.sort((a, b) => ({ positiv: 0, neutral: 1, negativ: 2 }[a.ton] - { positiv: 0, neutral: 1, negativ: 2 }[b.ton])),
    matchningar: [], // fylls av hamta.mjs
  };
  writeFileSync(trendFil(dag), JSON.stringify(logg, null, 2) + "\n");
  console.log(`Trender ${dag}: ${trender.length} (${logg.sammanfattning.positiva} positiva, ${logg.sammanfattning.neutrala} neutrala, ${logg.sammanfattning.negativa_bortsorterade} negativa bortsorterade). Klassning: ${logg.klassning}, ~$${logg.kostnadUSD}. Keyword Planner: ${ads.status}.`);
  for (const s of logg.kallor.filter((k) => k.fel)) console.warn(`  ${s.kalla}: ${s.fel}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await kor();
