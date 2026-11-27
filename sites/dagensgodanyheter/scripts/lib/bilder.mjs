// Bilder till artiklarna, i den här ordningen:
//   1. Fria licensbilder: NASA:s bildarkiv (public domain) och Wikimedia Commons. Varje träff granskas visuellt
//      (visar den ämnet, är den ett riktigt foto, syns personer?) innan den används.
//      Licens, fotograf och källa sparas alltid och visas under bilden.
//   2. Annars en skapad bild från gpt-image-2.6-flare (ai-bild.mjs, kräver OPENAI_API_KEY), med bildtexten
//      BILDTEXT_GENERERAD. Den föreställer aldrig verkliga personer, platser eller händelser.
// Varje bild får en alt-text på svenska, 80–125 tecken, som beskriver vad bilden faktiskt visar (Claude Haiku tittar
// på bilden). Går det inte att få en godkänd alt-text används ingen bild.
// Bara de högst poängsatta artiklarna får bild (scripts/bildsatt.mjs); övriga publiceras som ren text.
// Bilderna sparas lokalt i public/bilder/ i 1280 och 640 px bredd (WebP), så att sajten inte är beroende av andra servrar.
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hamta, textAvHtml } from "./natet.mjs";
import { aiBild, bildnamn } from "./ai-bild.mjs";
import { altFel, ALT_MIN, ALT_MAX } from "../../src/lib/bildtext.js";

const TILLATNA = [/^public domain$/i, /^pd/i, /^cc0/i, /^cc[ -]by(?:[ -]sa)?[ -]\d/i, /^cc[ -]by(?:[ -]sa)?$/i];

async function sokCommons(sokord) {
  const traffar = [];
  const q = encodeURIComponent(`${sokord} filetype:bitmap`);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${q}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280`;
  const svar = JSON.parse((await hamta(url, { accept: "application/json" })).data);
  const sidor = Object.values(svar?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const s of sidor) {
    const ii = s.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const licens = textAvHtml(meta.LicenseShortName?.value ?? "");
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < 1200) continue;
    if (!TILLATNA.some((re) => re.test(licens))) continue;
    if (textAvHtml(meta.Restrictions?.value ?? "")) continue; // t.ex. personlighetsrätt eller varumärke
    if (ii.width / ii.height < 1.2) continue; // liggande bilder fungerar bäst i Discover (16:9)
    traffar.push({
      url: ii.thumburl || ii.url,
      fotograf: textAvHtml(meta.Artist?.value ?? "").slice(0, 120) || "Okänd",
      licens,
      licensUrl: meta.LicenseUrl?.value || (/^cc0/i.test(licens) ? "https://creativecommons.org/publicdomain/zero/1.0/" : null),
      kallaUrl: ii.descriptionurl,
      kalla: "Wikimedia Commons",
      beskrivning: textAvHtml(meta.ImageDescription?.value ?? "").slice(0, 200),
    });
    if (traffar.length >= 3) break;
  }
  return traffar;
}

async function sokNasa(sokord) {
  const traffar = [];
  const url = `https://images-api.nasa.gov/search?media_type=image&q=${encodeURIComponent(sokord)}`;
  const svar = JSON.parse((await hamta(url, { accept: "application/json" })).data);
  for (const post of svar?.collection?.items?.slice(0, 8) ?? []) {
    const d = post.data?.[0];
    if (!d || /logo|patch|portrait/i.test(d.title)) continue;
    // NASA:s arkiv innehåller även partnerbilder (ESA, JAXA m.fl.) som inte är public domain – hoppa över dem.
    const kredit = [d.photographer, d.secondary_creator, d.center, d.description, ...(d.keywords ?? [])].join(" ");
    if (/\b(ESA|JAXA|CSA|copyright)\b|©|Getty|Reuters|AP Photo/i.test(kredit)) continue;
    // Konstnärliga illustrationer och datorgrafik får inte presenteras som foto: hoppa över dem.
    if (/illustration|artist'?s? (concept|impression|rendering)|\bconcept\b|\brender(ing)?\b|animation|\bCGI\b|graphic/i.test(`${d.title} ${kredit}`)) continue;
    if (d.date_created && Number(d.date_created.slice(0, 4)) < 1995) continue; // gamla arkivfoton visar sällan det nyheten handlar om
    const nasaId = d.nasa_id;
    const lista = JSON.parse((await hamta(`https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`, { accept: "application/json" })).data);
    const filer = lista?.collection?.items?.map((i) => i.href) ?? [];
    const val = filer.find((h) => /~large\.jpg$/i.test(h)) || filer.find((h) => /~orig\.jpg$/i.test(h));
    if (!val) continue;
    traffar.push({
      url: val.replace(/^http:/, "https:"),
      fotograf: d.photographer || d.secondary_creator || "NASA",
      licens: "Public domain (NASA)",
      licensUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      kallaUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
      kalla: "NASA Image and Video Library",
      beskrivning: String(d.title || "").slice(0, 200),
    });
    if (traffar.length >= 3) break;
  }
  return traffar;
}

// Visuell kontroll av en fri bild innan den används (Claude Haiku med bilden som indata): visar den ämnet, är det
// ett riktigt foto (inte en illustration eller datorgrafik), syns identifierbara personer? Ger också en svensk
// alt-text som beskriver vad bilden faktiskt visar – inte vad skribenten gissade.
const GRANSKA_BILD_SYSTEM = `Du granskar en arkivbild som kan användas till en nyhetsartikel på en svensk sajt.
Bedöm bilden själv, inte bara bildtiteln. Svara:
- passar: true bara om bilden tydligt visar artikelns ämne (samma sak, art, plats, instrument eller farkost) – inte bara något närliggande.
- foto: true om det är ett riktigt fotografi; false om det är en illustration, målning, datorgrafik, rendering eller ett diagram.
- personer: true om det finns personer vars ansikten går att känna igen.
- alt: en beskrivande alt-text på svenska, ${ALT_MIN}–${ALT_MAX} tecken, om vad bilden faktiskt visar (motiv, miljö, färger), i hela meningar som slutar med punkt. Upprepa inte rubriken och skriv aldrig ordet "AI".`;
const GRANSKA_BILD_SCHEMA = {
  type: "object", additionalProperties: false, required: ["passar", "foto", "personer", "alt"],
  properties: { passar: { type: "boolean" }, foto: { type: "boolean" }, personer: { type: "boolean" }, alt: { type: "string" } },
};
// Alt-text för en bild som redan är vald: beskriver vad bilden faktiskt visar.
const ALT_SYSTEM = `Du skriver alt-texter till bilder på en svensk nyhetssajt.
Titta på bilden och skriv en beskrivande alt-text på svenska, ${ALT_MIN}–${ALT_MAX} tecken (räkna tecknen), om vad bilden faktiskt visar: motiv, miljö, ljus och färger. Skriv en eller två hela meningar som slutar med punkt.
Om bilden är målad eller tecknad, börja med "Målad illustration av" eller "Tecknad bild av". Upprepa inte artikelns rubrik.
Skriv aldrig ordet "AI", inga namn på verkliga personer och inget som inte syns i bilden.`;
const ALT_SCHEMA = { type: "object", additionalProperties: false, required: ["alt"], properties: { alt: { type: "string" } } };

/**
 * Säkrar en godkänd alt-text (src/lib/bildtext.js): förslaget om det klarar reglerna (för långa kortas vid ett
 * ordslut), annars skriver Haiku en ny utifrån bilden (högst fyra försök). Returnerar { alt, kostnad }; alt är null
 * om ingen godkänd text gick att få.
 */
export const kortaAlt = (t) => {
  t = String(t ?? "").trim();
  if (t.length <= ALT_MAX) return t;
  // Bara vid en satsgräns (komma, tankstreck, "och", "med"), så att texten fortfarande läses som en hel mening.
  let basta = -1;
  for (const m of t.slice(0, ALT_MAX + 1).matchAll(/, | – | och | med /g)) if (m.index >= ALT_MIN) basta = m.index;
  return basta > 0 ? `${t.slice(0, basta)}.` : t;
};
export async function sakraAlt(data, forslag, { rubrik = "", ingress = "" } = {}) {
  if (!altFel(kortaAlt(forslag), rubrik)) return { alt: kortaAlt(forslag), kostnad: 0 };
  const { jsonAnrop, MODELL_POANG } = await import("./claude.mjs");
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(data).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  let kostnad = 0, fel = altFel(forslag, rubrik);
  for (let forsok = 0; forsok < 4; forsok++) {
    const svar = await jsonAnrop({
      modell: MODELL_POANG, system: ALT_SYSTEM, schema: ALT_SCHEMA, effort: "medium", maxTokens: 2000,
      innehall: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        { type: "text", text: [
          `ARTIKELNS RUBRIK: ${rubrik}`, `INGRESS: ${ingress}`,
          `FÖRRA FÖRSLAGET (${String(forslag ?? "").length} tecken): ${forslag || "(inget)"} – ${fel}.`,
          "Sikta på 90–110 tecken: en eller två korta, fullständiga meningar om motiv, miljö och färger. Skriv hellre en kort hel mening än en lång som klipps av.",
        ].join("\n") },
      ],
    });
    kostnad += svar.kostnad;
    const alt = kortaAlt(svar.data.alt);
    fel = altFel(alt, rubrik);
    if (!fel) return { alt, kostnad };
    forslag = alt;
  }
  return { alt: null, kostnad };
}

async function granskaBild(data, traff, { rubrik, ingress }) {
  const { jsonAnrop, MODELL_POANG } = await import("./claude.mjs");
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(data).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const svar = await jsonAnrop({
    modell: MODELL_POANG, system: GRANSKA_BILD_SYSTEM, schema: GRANSKA_BILD_SCHEMA, effort: "low", maxTokens: 1000,
    innehall: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
      { type: "text", text: `ARTIKELNS RUBRIK: ${rubrik}\nINGRESS: ${ingress}\nBILDTITEL I ARKIVET: ${traff.beskrivning || "(saknas)"}\nKÄLLA: ${traff.kalla}` },
    ],
  });
  return { ...svar.data, kostnad: svar.kostnad };
}

/** Sparar bilden som WebP i två storlekar. Returnerar { fil, bredd, hojd } eller null. */
export async function sparaBild(url, slug, publicDir, data = null) {
  const sharp = (await import("sharp")).default;
  const dir = join(publicDir, "bilder");
  mkdirSync(dir, { recursive: true });
  if (!data) ({ data } = await hamta(url, { accept: "image/*", binar: true, timeout: 60000 }));
  const stor = sharp(data).rotate().resize({ width: 1280, height: 720, fit: "cover", position: "attention" });
  await stor.clone().webp({ quality: 78 }).toFile(join(dir, `${bildnamn(slug)}.webp`));
  await stor.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(dir, `${bildnamn(slug)}.jpg`)); // för Open Graph
  await sharp(data).rotate().resize({ width: 640, height: 360, fit: "cover", position: "attention" }).webp({ quality: 74 }).toFile(join(dir, `${bildnamn(slug)}-640.webp`));
  return { fil: `/bilder/${bildnamn(slug)}.webp`, og: `/bilder/${bildnamn(slug)}.jpg`, liten: `/bilder/${bildnamn(slug)}-640.webp`, bredd: 1280, hojd: 720 };
}

/**
 * Hittar en bild för artikeln: först ett riktigt fritt foto (NASA för rymdnyheter, Wikimedia Commons) som har
 * klarat den visuella kontrollen, annars en redaktionell illustration (ai-bild.mjs).
 * `sokord` är engelska söktermer från skrivmodellen, `motiv` en konkret engelsk beskrivning av ämnet.
 * Returnerar bilddata (kostnadUSD för illustrationen, granskningUSD för kontrollerna) eller null.
 */
export async function hittaBild({ slug, sokord = [], motiv, kategori, alt, rubrik = "", ingress = "", publicDir, rymd = false }) {
  if (existsSync(join(publicDir, "bilder", `${bildnamn(slug)}.webp`))) return null; // finns redan – rör inte
  let granskning = 0;
  const kontroller = [];
  const sokningar = [];
  for (const s of sokord.slice(0, 3)) {
    if (rymd) sokningar.push(() => sokNasa(s));
    // Wikimedia Commons sök-API (/w/api.php) är spärrat i Commons robots.txt, som vi följer. sokCommons finns kvar
    // om spärren hävs; slå på med GODA_COMMONS=pa.
    if (process.env.GODA_COMMONS === "pa") sokningar.push(() => sokCommons(s));
  }
  const provade = new Set();
  for (const sok of sokningar) {
    if (kontroller.length >= 6) break; // högst sex granskade kandidater per artikel
    let traffar = [];
    try { traffar = await sok(); } catch { continue; }
    for (const t of traffar) {
      if (provade.has(t.url) || kontroller.length >= 6) continue;
      provade.add(t.url);
      try {
        const { data } = await hamta(t.url, { accept: "image/*", binar: true, timeout: 60000 });
        const g = await granskaBild(data, t, { rubrik, ingress });
        granskning += g.kostnad;
        kontroller.push({ url: t.kallaUrl, passar: g.passar, foto: g.foto, personer: g.personer });
        if (!g.passar || !g.foto || g.personer) continue;
        const altSvar = await sakraAlt(data, g.alt, { rubrik, ingress });
        granskning += altSvar.kostnad;
        if (!altSvar.alt) continue;
        const sparad = await sparaBild(t.url, slug, publicDir, data);
        return { ...sparad, alt: altSvar.alt, fotograf: t.fotograf, licens: t.licens, licensUrl: t.licensUrl, kallaUrl: t.kallaUrl, kalla: t.kalla, arkivtitel: t.beskrivning, kontroller, granskningUSD: granskning, kostnadUSD: 0 };
      } catch { /* prova nästa */ }
    }
  }
  const ill = await aiBild({ slug, motiv, kategori, alt, publicDir });
  if (!ill) return null;
  const altSvar = await sakraAlt(readFileSync(join(publicDir, ill.fil)), ill.alt, { rubrik, ingress });
  granskning += altSvar.kostnad;
  if (!altSvar.alt) {
    // Ingen godkänd alt-text: bilden används inte (filerna i public/bilder tas bort, artikeln blir ren text).
    for (const f of [ill.fil, ill.og, ill.liten]) try { unlinkSync(join(publicDir, f)); } catch { /* fanns inte */ }
    throw new Error("ingen godkänd alt-text");
  }
  return { ...ill, alt: altSvar.alt, kontroller, granskningUSD: granskning };
}
