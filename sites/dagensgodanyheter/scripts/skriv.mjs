// Steg 2 i nattbygget: skriver 10–15 artiklar med egna ord från förstahandskällor och faktakontrollerar dem.
//
//   node scripts/skriv.mjs              # skriv (kräver ANTHROPIC_API_KEY), annars torrläge
//   node scripts/skriv.mjs --torr       # torrläge: väljer kandidater, hämtar källtexter och uppskattar kostnaden – skriver inget
//   node scripts/skriv.mjs --antal=12   # antal artiklar (10–15)
//
// Varje artikel:
//   1. Källtexten hämtas från förstahandskällan (robots.txt respekteras, högst 1 anrop/s).
//   2. Skrivmodellen skriver 300–700 ord med egna ord: H1, ingress, H2-avsnitt, faktaruta och "Varför det spelar roll".
//   3. Maskinella kontroller: längd, struktur, inga citat som inte står ordagrant i källan, ingen kopierad text.
//   4. Ett andra modellanrop jämför artikeln mot källtexten. Underkänd artikel publiceras inte.
//   5. Bild väljs inte här: scripts/bildsatt.mjs ger nattens högst poängsatta artiklar en bild (fritt foto först,
//      annars en illustration). Övriga artiklar publiceras som ren text.
// Resultat: data/artiklar/<datum>-<slug>.json och en rapport i data/raw/skrivrapport.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hamta, huvudtext } from "./lib/natet.mjs";
import { laddaEnv } from "./lib/env.mjs";
import { KALLOR } from "./kallor.mjs";
import { KAT_SLUGS } from "../src/lib/kategorier.js";
import { AMNESHUBBAR } from "../src/lib/amnen.js";
import { antalOrd, maskinkontroll, kopieradeFraser, naraOmskrivning, KOPIERAT } from "./lib/kontroll.mjs";
import { likhet, SAMMA_NYHET } from "./lib/likhet.mjs";
import { troligaKallor, sidinfo, enligtFel, BYRA } from "./lib/forstahand.mjs";

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROT, "data", "raw");
const ARTIKLAR = join(ROT, "data", "artiklar");
const PUBLIC = join(ROT, "public");
mkdirSync(RAW, { recursive: true });
mkdirSync(ARTIKLAR, { recursive: true });
laddaEnv();

const args = process.argv.slice(2);
const antalArg = Number((args.find((a) => a.startsWith("--antal=")) || "").split("=")[1]);
const ANTAL = Math.max(1, Math.min(15, Number.isFinite(antalArg) && antalArg > 0 ? antalArg : 12));
// --bara=ekonomi,kultur skriver bara i de avdelningarna (för en riktad påfyllning).
const BARA = (args.find((a) => a.startsWith("--bara="))?.slice(7) ?? "").split(",").filter(Boolean);
const TORR = args.includes("--torr") || !process.env.ANTHROPIC_API_KEY;
const MAX_PER_KAT = 3;
const MAX_PER_KALLA = 2;
// Medier är tipskällor: högst så här många av nattens valda kandidater kommer från medier (dubbelt antal, som reserv).
const MAX_MEDIER = 5;
// Varje avdelning ska ha minst MIN_PER_KAT artiklar från de senaste 36 timmarna. Avdelningar under kvoten får
// välja först (bästa kandidaten i varje), sedan fylls resten efter poäng.
const MIN_PER_KAT = 2;
// Belagda bakgrundsfakta (Världen i siffror, data/varlden-i-siffror.json) som skribenten får använda för att sätta en
// nyhet i ett större sammanhang, t.ex. hur det var för tio eller femtio år sedan. Faktagranskaren får samma lista,
// och artikeln länkar till källan för varje bakgrundsfakta den använder.
const BAKGRUND = (() => {
  try { return JSON.parse(readFileSync(join(ROT, "data", "varlden-i-siffror.json"), "utf8")).punkter.filter((p) => p.text && p.kalla?.url).map((p, i) => ({ id: `B${i + 1}`, text: p.text, kalla: { namn: p.kalla.namn, url: p.kalla.url } })); }
  catch { return []; }
})();
const BAKGRUND_TEXT = BAKGRUND.map((b) => `${b.id}: ${b.text} (källa: ${b.kalla.namn})`).join("\n");

const MIN_KALLTEXT = 900; // tecken; kortare källor räcker inte för en faktagranskad artikel

const kallaAv = Object.fromEntries(KALLOR.map((k) => [k.id, k]));

// ---------- urval ----------
const kandFil = join(RAW, "kandidater.json");
if (!existsSync(kandFil)) { console.error("Kör först: node scripts/hamta.mjs"); process.exit(1); }
const { kandidater } = JSON.parse(readFileSync(kandFil, "utf8"));
const befintliga = readdirSync(ARTIKLAR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(ARTIKLAR, f), "utf8")));
// Både källans slutliga adress (efter omdirigering) och kandidatens adress räknas som redan skrivna.
const skrivnaUrl = new Set(befintliga.flatMap((a) => [a.kalla.url, a.kalla.kandidatUrl]).filter(Boolean));
const skrivnaRubriker = befintliga.flatMap((a) => [a.kalla.rubrik, a.rubrik]).filter(Boolean);
const redanSkriven = (c) => skrivnaUrl.has(c.url) || skrivnaRubriker.some((r) => likhet(r, c.titel) >= SAMMA_NYHET);
const slugar = new Set(befintliga.map((a) => a.slug));
// Register över varje publicerad URL (data/publicerade.json). Artiklar tas aldrig bort: testet
// tester/arkiv.test.mjs kontrollerar att varje URL i registret fortfarande har sin artikel, och nattbygget
// stoppar före publicering om något saknas.
const REGISTER_FIL = join(dirname(ARTIKLAR), "publicerade.json");
const register = existsSync(REGISTER_FIL) ? JSON.parse(readFileSync(REGISTER_FIL, "utf8")) : [];
const registrera = (post) => {
  if (register.some((r) => r.href === post.href)) return;
  register.push(post);
  writeFileSync(REGISTER_FIL, JSON.stringify(register, null, 2) + "\n");
};
// Kandidater som redan har provats och underkänts eller hoppats över skrivs inte om på 14 dagar (sparas i
// data/provade.json, som checkas in av nattbygget). Annars skulle samma underkända nyhet kosta pengar varje natt.
const PROVADE_FIL = join(dirname(ARTIKLAR), "provade.json");
const PROVAD_DAGAR = 14;
const provade = (existsSync(PROVADE_FIL) ? JSON.parse(readFileSync(PROVADE_FIL, "utf8")) : [])
  .filter((p) => Date.now() - new Date(p.datum) < PROVAD_DAGAR * 864e5);
const provadeUrl = new Set(provade.map((p) => p.url));

// Avdelningar under kvoten får välja kandidater med positiv ≥ 0,45 (ekonomi och kultur är sällan "jublande"
// positiva men ofta konstruktiva). Skribenten avbryter ändå om källan inte är en positiv nyhet, och faktakontrollen är densamma.
const POSITIV_MIN = 0.55;
const POSITIV_MIN_KVOT = 0.45;
const ko = kandidater
  .filter((c) => !c.skriven && !redanSkriven(c) && !provadeUrl.has(c.url) && c.lamplig !== false && c.poang.positiv >= POSITIV_MIN_KVOT)
  .filter((c) => !BARA.length || BARA.includes(c.kat))
  .sort((a, b) => b.poang.total - a.poang.total);

// ---------- prompter ----------
const REDIGERA_SYSTEM = `Du är redigerare på Dagens goda nyheter. Du får en artikel som JSON och en lista med fraser som står ordagrant
i källtexten. Skriv om just de ställena med egna ord så att ingen följd av tio ord längre är identisk med källan.
Ändra inga sakuppgifter: namn, siffror, datum, platser och slutsatser ska vara exakt desamma. Egennamn och officiella titlar
får stå kvar, men omge dem med egna formuleringar. Behåll allt annat oförändrat (struktur, längd, slug, kategori, taggar,
bildfält). Sätt avbryt till false och orsak till en tom sträng. Svara med hela artikeln i samma JSON-format.`;

const SKRIV_SYSTEM = `Du är nyhetsskribent på Dagens goda nyheter, en svensk sajt med enbart positiva och hoppfulla nyheter.
Du skriver en artikel på svenska utifrån källtexten i användarmeddelandet. Oftast är det en förstahandskälla (pressmeddelande eller nyhet från en myndighet, ett lärosäte, ett forskningsinstitut eller en organisation). Ibland är det ett etablerat mediums artikel – ensam, eller tillsammans med förstahandskällan som mediet bygger på (studien, myndigheten eller organisationen).

Absoluta regler:
1. Använd bara fakta som står i källtexten. Lägg inte till siffror, namn, datum, orsaker eller slutsatser som inte står där. Allmänt känd bakgrund får bara nämnas om den är okontroversiell och nödvändig för att förstå (t.ex. vad ett nationalpark är), aldrig med siffror. Enda undantaget: BAKGRUNDSFAKTA längst ned, som är belagda och får användas ordagrant i sak när de verkligen hör till ämnet (lista då deras id i fältet bakgrund).
2. Skriv med helt egna ord. Kopiera inte meningar eller långa fraser från källan, och översätt inte mening för mening. Följ inte heller källans upplägg: välj en egen ingång, en egen ordning och egna mellanrubriker, så att artikeln aldrig blir en nära omskrivning av källan stycke för stycke.
3. Inga citat. Skriv inte citattecken runt någons ord, och hitta aldrig på vad någon har sagt. Du får återge i referat: "Enligt forskarna …".
4. Inga medicinska råd, inga doseringar och inga uppmaningar om behandling. Hälsonyheter beskriver forskning eller beslut, och att mer forskning ofta behövs innan något når vården om källan säger så.
5. Inga investeringsråd. Ekonomi beskrivs som fakta (vad som har hänt, siffror från källan), aldrig vad läsaren bör köpa, sälja eller förvänta sig av en aktie eller marknad.
6. Överdriv inte. Om källan säger "kan", "tyder på" eller "i djurförsök" ska artikeln säga samma sak. Rubriken får inte lova mer än källan.
7. Ingen partipolitik och inga värderingar om politiska aktörer. Ett regeringsbeslut beskrivs sakligt.
8. Om källan inte är en positiv nyhet, är för tunn för 300 ord utan utfyllnad, är reklam, eller kräver gissningar: sätt avbryt=true och förklara i orsak.
9. Mediekällor: finns en FÖRSTAHANDSKÄLLA som handlar om samma nyhet bygger du artikeln på den, nämner den vid namn (t.ex. "enligt studien i …" eller "enligt …") och sätter forstahand=true; mediets artikel är tipset och får bara ge sammanhang. Handlar förstahandskällan om något annat, eller finns bara MEDIETS ARTIKEL: sätt forstahand=false, skriv "enligt [mediets namn]" redan i ingressen och återge uppgifterna som mediets. Ta aldrig över mediets rubrik, vinkel eller formuleringar. Vanliga förstahandskällor (utan medium): forstahand=false.

Form:
- vinjett: 1–3 ord som beskriver ämnet (t.ex. "Rymden", "Cancerforskning").
- rubrik: 50–85 tecken, saklig och konkret, med det viktigaste först. Inga frågor, inga utropstecken, inget klickbete.
- seorubrik: sökrubrik för fliken och sökresultatet, 35–60 tecken. Ämne, plats och vad som har hänt eller upptäckts, med de ord en läsare faktiskt skulle söka på (t.ex. "Ny metod renar PFAS ur lakvatten – SLU-studie"). Samma fakta som rubriken, inget klickbete.
- ingress: 1–2 meningar (högst 45 ord) som svarar direkt på vad som har hänt, vem som står bakom och varför det är bra. Lyft det hoppfulla – det läsaren ska känna "det här gör världen lite bättre" av – men bara med källans egna uppgifter.
- avsnitt: 2–4 avsnitt, var och en med en informativ H2-rubrik (inte "Bakgrund" ensamt) och 1–3 stycken. Svaret först, detaljerna sedan.
- faktaruta: rubrik och 3–6 korta faktapunkter, alla med uppgifter ur källan (siffror, namn, platser, datum).
- varfor: 2–4 meningar om varför nyheten spelar roll och vad den betyder i ett större perspektiv. Sätt den gärna i sitt sammanhang – hur det var för tio eller femtio år sedan, eller vilken långsiktig förbättring den är en del av – men bara när källan eller en av BAKGRUNDSFAKTA stöder det. Finns inget sådant stöd: håll dig till vad nyheten själv möjliggör. Fakta går alltid före känsla: inga överdrifter, inga löften som källan inte ger.
- bakgrund: id för de BAKGRUNDSFAKTA du har använt (t.ex. ["B3"]), annars en tom lista.
- Total längd (ingress + avsnitt + varfor): 300–700 ord.
- beskrivning: metabeskrivning, 120–155 tecken.
- slug: kort URL-del med gemener a–z, siffror och bindestreck, utan å/ä/ö (å→a, ä→a, ö→o), högst 70 tecken.
- taggar: 2–5 ämnesord på svenska med gemener. Använd först de av dessa ämnen som passar, stavade exakt så: ${AMNESHUBBAR.map((h) => `"${h.namn}"`).join(", ")}. Lägg sedan till mer specifika ämnesord (t.ex. "prostatacancer", "fåglar").
- bildsok: 2–3 korta engelska söktermer för en FRI bild på Wikimedia Commons eller i NASA:s arkiv som visar ämnet (t.ex. "wind turbines offshore", "white-tailed eagle"). Aldrig namn på personer.
- bildmotiv: ett konkret bildmotiv på engelska (högst 30 ord) som visar ÄMNET: platsen, djurarten, instrumentet, tekniken eller landskapet. Inga personer som går att känna igen, inga namn, inga verkliga kända byggnader eller landmärken, ingen text och ingen återskapad händelse. Rymdnyheter: visa ett instrument, ett laboratorium eller en testanläggning – aldrig en påhittad bild av den verkliga himlakroppen eller farkosten (inte "forskaren tar emot priset" utan t.ex. "aspen trees in a Swedish boreal forest in late autumn light" eller "a deep-space telescope mirror in a clean room").
- bildalt: beskrivande alt-text på svenska, 80–125 tecken, om vad en bild av bildmotivet visar (motiv, miljö, ljus). Upprepa inte rubriken och skriv aldrig ordet "AI".
- kategori: en av ${KAT_SLUGS.join(", ")}.
Skriv vårdad, tydlig svenska som en erfaren nyhetsredaktör: korta meningar, aktiva verb, inga anglicismer, inga klyschor som "spännande" eller "banbrytande" om källan inte motiverar det. Tonen är varm och hoppfull genom sakinnehållet – inte genom värdeord.

BAKGRUNDSFAKTA (belagda, med källa):
${BAKGRUND_TEXT}`;

const SKRIV_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["avbryt", "orsak", "forstahand", "vinjett", "rubrik", "seorubrik", "bakgrund", "ingress", "avsnitt", "faktaruta", "varfor", "beskrivning", "slug", "taggar", "bildsok", "bildmotiv", "bildalt", "kategori"],
  properties: {
    avbryt: { type: "boolean" }, orsak: { type: "string" }, forstahand: { type: "boolean" },
    vinjett: { type: "string" }, rubrik: { type: "string" }, seorubrik: { type: "string" }, ingress: { type: "string" },
    avsnitt: { type: "array", items: { type: "object", additionalProperties: false, required: ["rubrik", "stycken"], properties: { rubrik: { type: "string" }, stycken: { type: "array", items: { type: "string" } } } } },
    faktaruta: { type: "object", additionalProperties: false, required: ["rubrik", "punkter"], properties: { rubrik: { type: "string" }, punkter: { type: "array", items: { type: "string" } } } },
    varfor: { type: "string" }, beskrivning: { type: "string" }, slug: { type: "string" },
    taggar: { type: "array", items: { type: "string" } }, bildsok: { type: "array", items: { type: "string" } },
    bildmotiv: { type: "string" }, bildalt: { type: "string" },
    bakgrund: { type: "array", items: { type: "string" } },
    kategori: { type: "string", enum: KAT_SLUGS },
  },
};

const GRANSKA_SYSTEM = `Du är faktagranskare på en svensk nyhetssajt. Du får en KÄLLTEXT och en ARTIKEL som ska bygga enbart på källtexten. KÄLLTEXTEN kan bestå av en förstahandskälla och ett mediums artikel om samma nyhet; påståenden får beläggas i någon av dem, men inte i något annat.
Gå igenom varje påstående i artikeln (rubrik, sökrubrik, ingress, avsnitt, faktaruta och "Varför det spelar roll") och jämför med källtexten.
Markera som problem:
- "fel": påståendet motsäger källan (fel siffra, fel namn, fel plats, fel datum, fel ordning).
- "saknas": påståendet går inte att belägga i källtexten eller i BAKGRUNDSFAKTA nedan (påhittade detaljer, siffror eller slutsatser). Okontroversiell allmänbildning utan siffror är okej. Ett påstående ur BAKGRUNDSFAKTA måste stämma exakt (samma siffror, år och område) – annars "fel".
- "overdrift": artikeln är säkrare eller större än källan (t.ex. "botar" när källan säger "kan bidra", eller djurförsök som framställs som behandling av människor).
- "citat": citattecken runt ord som inte står ordagrant i källan, eller återgivna uttalanden som inte finns i källan.
- "rad": medicinska råd eller investeringsråd.
- "kopia": längre stycken som är kopierade eller översatta ord för ord, eller en nära omskrivning där artikeln följer källans upplägg, vinkel och meningsordning stycke för stycke.
godkand=true bara om det inte finns något problem av typerna fel, saknas, citat, rad eller kopia, och högst mindre överdrifter. Var noggrann och hellre för sträng.

BAKGRUNDSFAKTA (belagda, får användas i artikeln):
${BAKGRUND_TEXT}`;

const GRANSKA_SCHEMA = {
  type: "object", additionalProperties: false, required: ["godkand", "problem", "sammanfattning"],
  properties: {
    godkand: { type: "boolean" },
    problem: { type: "array", items: { type: "object", additionalProperties: false, required: ["typ", "pastaende", "kommentar"], properties: { typ: { type: "string", enum: ["fel", "saknas", "overdrift", "citat", "rad", "kopia"] }, pastaende: { type: "string" }, kommentar: { type: "string" } } } },
    sammanfattning: { type: "string" },
  },
};

const slugAv = (s) => String(s).toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "");
function unikSlug(s) {
  let slug = slugAv(s) || "nyhet";
  let n = 2;
  while (slugar.has(slug)) slug = `${slugAv(s)}-${n++}`;
  slugar.add(slug);
  return slug;
}

// Förstahandskällan bakom en mediekällas nyhet: de troligaste länkarna i mediets artikel (studie, myndighet,
// lärosäte, organisation) provas i tur och ordning via hamta() – robots.txt och 1 anrop/s gäller som vanligt.
// Betalväggar, PDF:er och för korta sidor hoppas över. Skribenten avgör sedan om sidan handlar om samma nyhet.
const MIN_FORSTAHAND = 600;
async function forstahandskalla(sida, kalla) {
  const medier = KALLOR.filter((k) => k.typ === "medium").map((k) => k.hem);
  for (const l of troligaKallor(sida.data, sida.url, { utesluten: [kalla.hem, ...medier] }).slice(0, 3)) {
    try {
      const s = await hamta(l.url, { accept: "text/html" });
      if (!/html/i.test(s.typ)) continue;
      const text = huvudtext(s.data).slice(0, 16000);
      if (text.length < MIN_FORSTAHAND) continue;
      return { ...sidinfo(s.data, s.url), url: s.url, text };
    } catch { /* robots.txt, betalvägg eller fel – nästa länk */ }
  }
  return null;
}

// ---------- körning ----------
const rapport = { start: new Date().toISOString(), lage: TORR ? "torr" : "skarp", mal: ANTAL, publicerade: [], underkanda: [], hoppade: [], kostnad: 0, tokens: { in: 0, ut: 0 } };
const perKat = {};
const perKalla = {};
const valda = [];
const farska = {};
for (const a of befintliga) if (Date.now() - new Date(a.publicerad) < 36 * 3.6e6) farska[a.kategori] = (farska[a.kategori] ?? 0) + 1;
const arMediekalla = (c) => kallaAv[c.kalla]?.typ === "medium";
const ledig = (c) => (perKat[c.kat] ?? 0) < MAX_PER_KAT && (perKalla[c.kalla] ?? 0) < MAX_PER_KALLA && !valda.includes(c)
  && (!arMediekalla(c) || valda.filter(arMediekalla).length < MAX_MEDIER * 2)
  && !valda.some((v) => likhet(v.titel, c.titel) >= SAMMA_NYHET); // samma nyhet från en annan källa
const valj = (c) => { perKat[c.kat] = (perKat[c.kat] ?? 0) + 1; perKalla[c.kalla] = (perKalla[c.kalla] ?? 0) + 1; valda.push(c); };

// 1. Avdelningar under kvoten väljer först, tunnast först. Två varv, så att en avdelning med noll får två.
const tunna = KAT_SLUGS.filter((k) => (farska[k] ?? 0) < MIN_PER_KAT).sort((a, b) => (farska[a] ?? 0) - (farska[b] ?? 0));
for (let varv = 0; varv < MIN_PER_KAT; varv++) {
  for (const k of tunna) {
    if ((farska[k] ?? 0) + (perKat[k] ?? 0) >= MIN_PER_KAT) continue;
    const c = ko.find((x) => x.kat === k && ledig(x) && (x.poang.gladje ?? 1) >= 0.4); // här räcker POSITIV_MIN_KVOT, men nyheten ska kunna glädja
    if (c) valj(c);
  }
}
// 2. Resten efter poäng.
for (const c of ko) {
  if (valda.length >= ANTAL * 2) break; // reserv för underkända
  if (c.poang.positiv >= POSITIV_MIN && ledig(c)) valj(c);
}
// Kvotvalen först i skrivordningen, sedan efter poäng.
if (tunna.length) console.log(`Avdelningar under kvoten (${MIN_PER_KAT} på 36 h): ${tunna.map((k) => `${k} ${farska[k] ?? 0}`).join(", ")}`);

if (TORR) {
  // Torrläge: hämta källtexterna för att se att de går att använda, och uppskatta kostnaden.
  const { prisFor, MODELL_TEXT, MODELL_GRANSKA } = await import("./lib/claude.mjs");
  const [tin, tut] = prisFor(MODELL_TEXT);
  const [gin, gut] = prisFor(MODELL_GRANSKA);
  const SYSTEM_TOKENS = 1400;
  for (const c of valda.slice(0, ANTAL)) {
    let tecken = 0, fel = null;
    try { tecken = huvudtext((await hamta(c.url, { accept: "text/html" })).data).length; } catch (e) { fel = e.message; }
    const kallTokens = Math.min(tecken, 30000) / 3.2;
    // Skrivning: system + källa in, ~1 600 token text + ~2 500 token tänkande ut. Granskning: system + källa + artikel in, ~2 000 ut.
    const skriv = ((SYSTEM_TOKENS + kallTokens) * tin + 4100 * tut) / 1e6;
    const granska = ((900 + kallTokens + 1600) * gin + 2000 * gut) / 1e6;
    rapport.publicerade.push({ titel: c.titel, kalla: c.kalla, kat: c.kat, poang: c.poang.total, kalltecken: tecken, fel, uppskattadKostnad: Math.round((skriv + granska) * 1000) / 1000 });
    if (!fel && tecken >= MIN_KALLTEXT) rapport.kostnad += skriv + granska;
  }
  const ok = rapport.publicerade.filter((p) => !p.fel && p.kalltecken >= MIN_KALLTEXT).length;
  rapport.kostnad = Math.round(rapport.kostnad * 100) / 100;
  writeFileSync(join(RAW, "torrkorning.json"), JSON.stringify(rapport, null, 2));
  console.log(`TORRLÄGE (${process.env.ANTHROPIC_API_KEY ? "--torr" : "ANTHROPIC_API_KEY saknas"}): inga artiklar skrivs.`);
  console.log(`${valda.length} kandidater valda, ${ok} av de första ${Math.min(ANTAL, valda.length)} har en användbar källtext.`);
  for (const p of rapport.publicerade) console.log(`  ${p.fel ? "FEL" : p.kalltecken >= MIN_KALLTEXT ? "OK " : "KORT"} ${String(p.poang).padStart(3)} [${p.kat}] ${p.titel.slice(0, 80)} (${p.kalltecken} tecken, ~$${p.uppskattadKostnad})`);
  console.log(`Uppskattad kostnad för natten: ~$${rapport.kostnad} (${MODELL_TEXT} skriver, ${MODELL_GRANSKA} granskar, plus ~$0,01 för poängsättningen).`);
  process.exit(0);
}

const { jsonAnrop, MODELL_TEXT, MODELL_GRANSKA } = await import("./lib/claude.mjs");
const bokfor = (svar, steg) => {
  rapport.kostnad += svar.kostnad;
  rapport.kostnadPerSteg ??= {};
  rapport.kostnadPerSteg[steg] = (rapport.kostnadPerSteg[steg] ?? 0) + svar.kostnad;
  rapport.tokens.in += (svar.usage?.input_tokens ?? 0) + (svar.usage?.cache_read_input_tokens ?? 0) + (svar.usage?.cache_creation_input_tokens ?? 0);
  rapport.tokens.ut += svar.usage?.output_tokens ?? 0;
};

// Kostnadstak i USD (GODA_KOSTNADSTAK). Nästa artikel påbörjas inte om taket är nått; en artikel kostar högst
// några tiotals cent, så taket överskrids aldrig med mer än så.
const TAK = Number(process.env.GODA_KOSTNADSTAK) || Infinity;
for (const c of valda) {
  if (rapport.publicerade.length >= ANTAL) break;
  if (arMediekalla(c) && rapport.publicerade.filter((p) => kallaAv[p.kalla]?.typ === "medium").length >= MAX_MEDIER) continue;
  if (rapport.kostnad >= TAK) { rapport.stoppad = `kostnadstaket $${TAK} nått`; console.warn(`Stoppar: kostnadstaket $${TAK} är nått.`); break; }
  const logg = { titel: c.titel, url: c.url, kalla: c.kalla };
  try {
    const sida = await hamta(c.url, { accept: "text/html" });
    const kalla = kallaAv[c.kalla];
    const arMedium = kalla.typ === "medium";
    const medietext = huvudtext(sida.data).slice(0, arMedium ? 14000 : 30000);
    if (medietext.length < MIN_KALLTEXT) { rapport.hoppade.push({ ...logg, orsak: `källtexten är för kort (${medietext.length} tecken)` }); continue; }
    // Nyhetsbyråtext (TT, AFP, Reuters …) i ett medium: byråernas villkor förbjuder återanvändning.
    if (arMedium && BYRA.test(medietext)) { rapport.hoppade.push({ ...logg, orsak: "nyhetsbyråtext i mediets artikel" }); continue; }
    // Mediekällor: försök alltid hitta förstahandskällan bakom nyheten (studien, myndigheten, organisationen).
    const primar = arMedium ? await forstahandskalla(sida, kalla) : null;
    if (arMedium) logg.forstahand = primar?.url ?? null;
    const mediumNamn = kalla.kortnamn ?? kalla.namn;
    // Allt vi faktiskt har som källtext – skribenten, maskinkontrollen och faktagranskaren får samma text.
    const kalltext = primar
      ? `FÖRSTAHANDSKÄLLA: ${primar.namn}\nURL: ${primar.url}\n\n${primar.text}\n\n=====\n\nMEDIETS ARTIKEL: ${mediumNamn}\nURL: ${sida.url}\n\n${medietext}`
      : arMedium ? `MEDIETS ARTIKEL: ${mediumNamn}\nURL: ${sida.url}\n\n${medietext}` : medietext;
    const anvisning = !arMedium ? ""
      : primar ? `\nANVISNING: Mediet ${mediumNamn} har uppmärksammat nyheten. Förstahandskällan (${primar.namn}) har hämtats – bygg artikeln på den om den handlar om samma nyhet.\n`
        : `\nANVISNING: Ingen förstahandskälla kunde hämtas. Skriv "enligt ${mediumNamn}" i ingressen och återge uppgifterna som mediets (forstahand=false).\n`;
    const anvandartext = `KÄLLA: ${kalla.namn} (${kalla.hem})\nURL: ${sida.url}\nPUBLICERAD: ${c.datum ?? "okänt"}\nFÖRESLAGEN KATEGORI: ${c.kat}\n${anvisning}\nKÄLLTEXT:\n${kalltext}`;

    const skriv = await jsonAnrop({ modell: MODELL_TEXT, system: SKRIV_SYSTEM, text: anvandartext, schema: SKRIV_SCHEMA, effort: "medium" });
    bokfor(skriv, "text");
    const a = skriv.data;
    if (a.avbryt) { rapport.hoppade.push({ ...logg, orsak: `skribenten avbröt: ${a.orsak}` }); continue; }

    let maskin = maskinkontroll(a, kalltext);
    // Ett redigeringsvarv om det enda felet är kopierade ordföljder: de markerade fraserna skrivs om med egna ord,
    // sakuppgifterna får inte ändras. Sedan körs samma kontroll igen – och faktagranskningen därefter som vanligt.
    if (maskin.length === 1 && maskin[0] === KOPIERAT) {
      const fraser = kopieradeFraser(a, kalltext);
      const red = await jsonAnrop({
        modell: MODELL_TEXT, system: REDIGERA_SYSTEM, schema: SKRIV_SCHEMA, effort: "low",
        text: `KOPIERADE FRASER (står ordagrant i källan och måste formuleras om):\n- ${fraser.join("\n- ")}\n\nARTIKEL (JSON):\n${JSON.stringify(a)}`,
      });
      bokfor(red, "redigering");
      const ny = red.data;
      if (!ny.avbryt && ny.slug && ny.kategori) {
        Object.assign(a, ny);
        maskin = maskinkontroll(a, kalltext);
        logg.redigerad = true;
      }
    }
    if (arMedium) {
      const anvandPrimar = Boolean(primar && a.forstahand);
      // Utan förstahandskälla: "enligt [medium]" i ingressen. Med: mediets text får inte ha skrivits om nära.
      if (!anvandPrimar) { const f = enligtFel(a, mediumNamn); if (f) maskin.push(f); }
      const nara = naraOmskrivning(a, medietext);
      if (nara) maskin.push(nara);
    }
    if (maskin.length) { rapport.underkanda.push({ ...logg, steg: "maskinkontroll", problem: maskin }); continue; }

    const artikelText = [`RUBRIK: ${a.rubrik}`, `SÖKRUBRIK: ${a.seorubrik ?? ""}`, `INGRESS: ${a.ingress}`, ...a.avsnitt.map((s) => `## ${s.rubrik}\n${s.stycken.join("\n")}`), `FAKTARUTA – ${a.faktaruta.rubrik}:\n- ${a.faktaruta.punkter.join("\n- ")}`, `VARFÖR DET SPELAR ROLL: ${a.varfor}`].join("\n\n");
    const granskning = await jsonAnrop({ modell: MODELL_GRANSKA, system: GRANSKA_SYSTEM, text: `KÄLLTEXT:\n${kalltext}\n\n=====\n\nARTIKEL:\n${artikelText}`, schema: GRANSKA_SCHEMA, effort: "high" });
    bokfor(granskning, "faktakontroll");
    const g = granskning.data;
    const allvarliga = (g.problem ?? []).filter((p) => p.typ !== "overdrift");
    if (!g.godkand || allvarliga.length) { rapport.underkanda.push({ ...logg, steg: "faktakontroll", problem: g.problem, sammanfattning: g.sammanfattning }); continue; }

    const nu = new Date().toISOString();
    const slug = unikSlug(a.slug);
    // Bilden väljs i ett eget steg (scripts/bildsatt.mjs): bara nattens högst poängsatta artiklar får bild.
    const bild = null;

    const artikel = {
      id: c.id, slug, kategori: a.kategori, vinjett: a.vinjett, rubrik: a.rubrik,
      ...(a.seorubrik?.trim() && a.seorubrik.trim().length <= 62 && { seorubrik: a.seorubrik.trim() }),
      ingress: a.ingress,
      avsnitt: a.avsnitt, faktaruta: a.faktaruta, varfor: a.varfor, taggar: a.taggar.map((t) => t.toLowerCase().trim()).slice(0, 5),
      beskrivning: a.beskrivning,
      // Med spårad förstahandskälla är den artikelns källa och mediet står som "via"; annars är mediet källan.
      kalla: primar && a.forstahand
        ? { id: kalla.id, namn: primar.namn, url: primar.url, kandidatUrl: c.url, hem: primar.hem, typ: "forstahand", rubrik: primar.rubrik || c.titel }
        : { id: kalla.id, namn: kalla.namn, url: sida.url, kandidatUrl: c.url, hem: kalla.hem, typ: kalla.typ, publicerad: c.datum, rubrik: c.titel },
      ...(arMedium && primar && a.forstahand && { via: { namn: kalla.namn, url: sida.url, hem: kalla.hem, publicerad: c.datum, rubrik: c.titel } }),
      ovrigaKallor: (c.aven ?? []).map((x) => ({ namn: kallaAv[x.kalla]?.namn ?? x.kalla, url: x.url })),
      publicerad: nu, uppdaterad: nu,
      bild: bild ?? null,
      bildmotiv: a.bildmotiv,
      bildalt: a.bildalt,
      bildsok: a.bildsok,
      bildRymd: kalla.typ === "rymd" || /rymd|space|planet|galax|stjärn/i.test(a.taggar.join(" ")),
      poang: { positiv: c.poang.positiv, gladje: c.poang.gladje ?? c.poang.positiv, betydelse: c.poang.betydelse, tillit: c.poang.tillit, ...(c.poang.aktualitet && { aktualitet: c.poang.aktualitet }), total: c.poang.total },
      typ: c.typ ?? "ovrigt",
      ...(c.trend && { trend: c.trend }),
      ...((a.bakgrund ?? []).length && { bakgrund: BAKGRUND.filter((b) => a.bakgrund.includes(b.id)) }),
      produktion: { metod: "ai-stod", skrivmodell: skriv.modell, granskningsmodell: granskning.modell, granskad: nu, anmarkningar: (g.problem ?? []).map((p) => `${p.typ}: ${p.kommentar}`) },
      rattelser: [],
    };
    // "wx": en befintlig artikelfil skrivs aldrig över – då kastas ett fel och kandidaten hoppas över.
    const fil = `${nu.slice(0, 10)}-${slug}.json`;
    writeFileSync(join(ARTIKLAR, fil), JSON.stringify(artikel, null, 2) + "\n", { flag: "wx" });
    registrera({ href: `/${artikel.kategori}/${slug}/`, fil, publicerad: nu });
    rapport.publicerade.push({ ...logg, slug, kategori: a.kategori, ord: antalOrd(a), bild: bild ? (bild.ai ? "ai" : bild.kalla) : "ingen" });
    console.log(`PUBLICERAD [${a.kategori}] ${a.rubrik}`);
  } catch (e) {
    rapport.hoppade.push({ ...logg, orsak: String(e.message || e) });
  }
}

if (!TORR) {
  for (const p of [...rapport.underkanda, ...rapport.hoppade]) {
    if (p.url && !provadeUrl.has(p.url)) provade.push({ url: p.url, titel: p.titel, datum: new Date().toISOString(), orsak: p.steg ?? String(p.orsak ?? "").slice(0, 120) });
  }
  writeFileSync(PROVADE_FIL, JSON.stringify(provade, null, 2) + "\n");
}
rapport.slut = new Date().toISOString();
rapport.kostnad = Math.round(rapport.kostnad * 1000) / 1000;
for (const k of Object.keys(rapport.kostnadPerSteg ?? {})) rapport.kostnadPerSteg[k] = Math.round(rapport.kostnadPerSteg[k] * 1000) / 1000;
writeFileSync(join(RAW, "skrivrapport.json"), JSON.stringify(rapport, null, 2));
console.log(`\n${rapport.publicerade.length} publicerade, ${rapport.underkanda.length} underkända, ${rapport.hoppade.length} hoppade. Kostnad ~$${rapport.kostnad} (${rapport.tokens.in} token in, ${rapport.tokens.ut} ut).`);
if (rapport.publicerade.length < 10) console.log("Färre än 10 artiklar i natt: för få kandidater klarade urvalet eller granskningen. Det är avsiktligt – hellre färre än sämre.");
