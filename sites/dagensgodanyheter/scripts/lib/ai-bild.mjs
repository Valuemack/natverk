// Skapade bilder via OpenAI:s bild-API (POST /v1/images/generations). Används när ingen fri bild finns.
//
//   OPENAI_API_KEY      – nyckeln (natverk/.env lokalt, GitHub-secret i nattbygget). Skrivs aldrig ut.
//   GODA_BILDKVALITET   – low | medium | high, standard "medium".
//   GODA_BILDSTIL       – "illustration" (standard) eller "foto", se src/lib/bildtext.js.
//
// Modellen är alltid gpt-image-2.6-flare. Det finns ingen reservmodell: svarar modellen inte publiceras artikeln
// utan bild.
//
// Regler som alltid gäller:
//   - Bildtexten är BILDTEXT_GENERERAD (src/lib/bildtext.js), genererad: true i datan.
//   - Stil "illustration": en tydligt målad redaktionell illustration. Stil "foto": en hyperrealistisk bild av en
//     allmän motivscen – aldrig något som kan tas för ett foto av den verkliga händelsen.
//   - Den visar ämnet – plats, djurart, instrument, teknik, landskap – aldrig verkliga, namngivna personer,
//     och den iscensätter inte den verkliga händelsen.
//   - Inga ansikten som går att känna igen, ingen text, inga logotyper.
//   - Hur bilden togs fram (modell, motiv, tid) sparas i artikeldatan för vår egen dokumentation.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BILDSTIL, BILDTEXT_GENERERAD } from "../../src/lib/bildtext.js";

/** Filnamn för artikelns bild: slugen utan ordet "ai" (det ska inte synas vid bilderna, inte heller i filnamnet). */
export const bildnamn = (slug) => String(slug).split("-").filter((d) => d !== "ai").join("-") || "bild";

export const BILD_ENDPOINT = "https://api.openai.com/v1/images/generations";
export const STANDARDMODELL = "gpt-image-2.6-flare";
export const BILDSTORLEK = "1536x864"; // 16:9, multiplar av 16, minst 1200 px bred (Discover)
/** Ungefärlig kostnad per bild i USD vid medium kvalitet (OpenAI anger tokenpris; 1536×1024 medium ≈ 0,041). */
export const UPPSKATTAD_KOSTNAD = { low: 0.006, medium: 0.04, high: 0.16 };
/** Tokenpriser i USD per miljon token för gpt-image-2.6-flare (bild ut 30; text in 5; bild in 10). Uppdatera om priserna ändras. */
export const BILDPRIS = { textIn: 5, bildIn: 10, bildUt: 30 };
/** Kostnad ur API-svarets usage-fält (input_tokens med text/bild-uppdelning, output_tokens). */
export function bildkostnad(usage) {
  if (!usage) return null;
  const text = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
  const bild = usage.input_tokens_details?.image_tokens ?? 0;
  return (text * BILDPRIS.textIn + bild * BILDPRIS.bildIn + (usage.output_tokens ?? 0) * BILDPRIS.bildUt) / 1e6;
}

// Ord som pekar på människor, personporträtt eller iscensatta händelser. Finns de i motivet används avdelningens
// neutrala standardmotiv i stället – hellre en enkel bild av ämnet än en bild som kan uppfattas som ett foto av någon.
const FORBJUDET = /\b(person|persons|people|woman|men|women|child|children|boy|girl|face|faces|portrait|selfie|crowd|politician|minister|president|king|queen|prime minister|celebrity|ceremony|press conference|protest|signing|handshake|photo of|människa|människor|personer|ansikte|porträtt|politiker|kung|drottning|statsminister|kändis|ceremoni|presskonferens)\b/i;

/** Neutralt motiv per avdelning när skrivmodellens motiv saknas eller inte går att använda. */
export const STANDARDMOTIV = {
  inrikes: "a quiet Swedish small-town street with wooden houses and bicycles in soft morning light",
  utrikes: "a wide landscape of terraced farmland and a river valley at sunrise, seen from a hillside",
  vetenskap: "a modern research laboratory bench with glassware, a microscope and notebooks in soft daylight",
  teknik: "close-up of precision engineering components and circuit boards on a clean workbench",
  miljo: "a clear lake surrounded by boreal forest under a bright sky, calm water reflections",
  halsa: "a clean hospital laboratory with sample racks and a centrifuge, soft natural light",
  ekonomi: "an orderly harbour with cargo containers and cranes in early morning light",
  "djur-natur": "a wild meadow with flowering plants and pollinating insects, shallow depth of field",
  kultur: "the reading room of an old library with wooden shelves and archival boxes, warm light",
};

export function rensaMotiv(motiv, kategori) {
  const m = String(motiv ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!m || FORBJUDET.test(m)) return STANDARDMOTIV[kategori] ?? STANDARDMOTIV.vetenskap;
  return m;
}

export function byggPrompt(motiv, kategori, stil = BILDSTIL) {
  const stilrader = stil === "foto"
    ? [
      `Hyperrealistic editorial photograph of a generic, representative scene: ${rensaMotiv(motiv, kategori)}.`,
      "Style: natural light, true-to-life colours, documentary nature and science photography, sharp detail, warm and hopeful mood, 16:9.",
      "It is a generic illustrative scene of the subject, not a picture of a specific real place, project or event.",
    ]
    : [
      `Editorial newspaper illustration of: ${rensaMotiv(motiv, kategori)}.`,
      "Style: a hand-painted gouache and ink illustration for the features pages of a quality newspaper – visible brush strokes, slightly textured paper, simplified shapes, confident ink outlines, a restrained palette of muted earthy colours with one warm accent, calm and optimistic mood, 16:9.",
      "It must read immediately as a drawn or painted illustration, never as a photograph: no photorealism, no camera look, no depth-of-field blur, no glossy 3D render.",
    ];
  return [
    ...stilrader,
    "Show the subject itself and keep it factually recognisable (correct species, materials and equipment) – the place, the species, the instrument, the technology or the landscape.",
    "No identifiable people: no faces; at most hands at work or small distant figures seen from behind.",
    "No text, letters, numbers, signs, logos, flags, watermarks or brand names.",
    "Do not depict any real, named person, do not show identifiable real landmarks or named buildings, and do not recreate a specific real event, ceremony, press conference or space-mission image as if it had been photographed.",
  ].join(" ");
}

export const bildInstallningar = () => ({
  modell: STANDARDMODELL, // alltid – ingen annan modell, ingen reserv
  stil: BILDSTIL,
  kvalitet: ["low", "medium", "high"].includes(process.env.GODA_BILDKVALITET) ? process.env.GODA_BILDKVALITET : "medium",
  storlek: BILDSTORLEK,
});

/**
 * Skapar och sparar en AI-bild. Returnerar bilddata för artikeln, eller null om nyckel saknas eller anropet nekas.
 * Sparar /bilder/{slug}.webp (1536×864), /bilder/{slug}.jpg (1280×720, delning) och /bilder/{slug}-640.webp.
 */
export async function aiBild({ slug, motiv, kategori, alt, publicDir, hamtare = fetch }) {
  const nyckel = process.env.OPENAI_API_KEY;
  if (!nyckel) return null;
  const { modell, kvalitet, storlek, stil } = bildInstallningar();
  const prompt = byggPrompt(motiv, kategori, stil);
  const svar = await hamtare(BILD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${nyckel}` },
    body: JSON.stringify({ model: modell, prompt, size: storlek, quality: kvalitet, output_format: "webp", output_compression: 90, n: 1 }),
    signal: AbortSignal.timeout(180000),
  });
  if (!svar.ok) {
    let kod = "";
    try { const j = await svar.json(); kod = j?.error?.code || j?.error?.type || ""; } catch { /* tomt svar */ }
    throw new Error(`Bild-API svarade ${svar.status}${kod ? ` (${kod})` : ""}`);
  }
  const json = await svar.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bild-API gav ingen bild");
  const data = Buffer.from(b64, "base64");
  const sharp = (await import("sharp")).default;
  const dir = join(publicDir, "bilder");
  mkdirSync(dir, { recursive: true });
  // Huvudbilden sparas som OpenAI levererade den (WebP 1536×864), så att ursprungsmetadatan (C2PA, IPTC/XMP) finns
  // kvar. Bara om formatet eller storleken avviker räknas den om. De mindre storlekarna behåller EXIF/XMP/IPTC.
  const meta = await sharp(data).metadata();
  if (meta.format === "webp" && meta.width === 1536 && meta.height === 864) writeFileSync(join(dir, `${bildnamn(slug)}.webp`), data);
  else await sharp(data).resize({ width: 1536, height: 864, fit: "cover" }).keepMetadata().webp({ quality: 80 }).toFile(join(dir, `${bildnamn(slug)}.webp`));
  await sharp(data).resize({ width: 1280, height: 720, fit: "cover" }).keepMetadata().jpeg({ quality: 82, mozjpeg: true }).toFile(join(dir, `${bildnamn(slug)}.jpg`));
  await sharp(data).resize({ width: 640, height: 360, fit: "cover" }).keepMetadata().webp({ quality: 76 }).toFile(join(dir, `${bildnamn(slug)}-640.webp`));
  return {
    fil: `/bilder/${bildnamn(slug)}.webp`, og: `/bilder/${bildnamn(slug)}.jpg`, liten: `/bilder/${bildnamn(slug)}-640.webp`, bredd: 1536, hojd: 864,
    alt, genererad: true, illustration: stil === "illustration", stil, licens: BILDTEXT_GENERERAD, fotograf: null, modell, motiv: rensaMotiv(motiv, kategori), skapad: new Date().toISOString(),
    anvandning: json.usage ?? null, kostnadUSD: bildkostnad(json.usage),
  };
}
