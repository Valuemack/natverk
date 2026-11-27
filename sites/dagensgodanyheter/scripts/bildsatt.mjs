// Bildsteget: som i en tidning får bara en del av artiklarna bild. Av nattens artiklar (publicerade de senaste
// 30 timmarna) får de cirka 35 % högst poängsatta en bild – i första hand ett riktigt fritt foto (NASA, Wikimedia
// Commons) som har klarat en visuell kontroll, annars en skapad bild från gpt-image-2.6-flare (stil enligt BILDSTIL). Övriga artiklar
// publiceras som ren text och markeras bildbeslut: "text", så att de inte prövas igen.
//
//   node scripts/bildsatt.mjs             # nattläge (kräver OPENAI_API_KEY för illustrationer, ANTHROPIC_API_KEY för bildkontrollen)
//   node scripts/bildsatt.mjs --torr      # visar urvalet och prompterna, skapar inget
//   node scripts/bildsatt.mjs --max=5     # högst så många nya bilder per körning (standard 5)
//   node scripts/bildsatt.mjs --andel=0.35 --timmar=30
//   node scripts/bildsatt.mjs --alla      # räkna andelen på alla artiklar, inte bara nattens (för en omstart)
//   node scripts/bildsatt.mjs --slug=x    # bara en artikel, utan andelsregeln
//
// Rör aldrig en artikel som redan har en bild. Resultat: uppdaterad artikel-JSON och data/raw/bildplan.json.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { laddaEnv } from "./lib/env.mjs";
import { byggPrompt, rensaMotiv, bildInstallningar, UPPSKATTAD_KOSTNAD } from "./lib/ai-bild.mjs";
import { hittaBild } from "./lib/bilder.mjs";

const TAK = Number(process.env.GODA_BILDTAK) || Infinity; // USD för bilderna i den här körningen

const ROT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROT, "data", "artiklar");
const RAW = join(ROT, "data", "raw");
const PUBLIC = join(ROT, "public");
mkdirSync(RAW, { recursive: true });
laddaEnv();

const arg = (namn) => process.argv.find((a) => a.startsWith(`--${namn}`));
const tal = (namn, std) => { const v = Number(arg(namn)?.split("=")[1]); return Number.isFinite(v) && v > 0 ? v : std; };
const max = tal("max", 5);
const andel = Math.min(1, tal("andel", 0.35));
const timmar = tal("timmar", 30);
const alla = Boolean(arg("alla"));
const bara = arg("slug")?.split("=")[1];
const torr = Boolean(arg("torr")); // utan OPENAI_API_KEY blir det bara fria foton (rymdnyheter), inga illustrationer
const inst = bildInstallningar();

const artiklar = (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")) : [])
  .map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const poang = (a) => a.poang?.total ?? 0;

let valda = [], textbeslut = [], mal = 0, harBild = 0, pool = [];
if (bara) {
  valda = artiklar.filter(({ a }) => a.slug === bara && !a.bild?.fil);
} else {
  pool = artiklar.filter(({ a }) => alla || Date.now() - new Date(a.publicerad) <= timmar * 3.6e6);
  mal = pool.length ? Math.max(1, Math.round(andel * pool.length)) : 0;
  harBild = pool.filter(({ a }) => a.bild?.fil).length;
  const utan = pool.filter(({ a }) => !a.bild?.fil && a.bildbeslut !== "text").sort((x, y) => poang(y.a) - poang(x.a));
  const platser = Math.max(0, Math.min(max, mal - harBild));
  valda = utan.slice(0, platser);
  textbeslut = utan.slice(platser);
}

const plan = {
  skapad: new Date().toISOString(),
  lage: torr ? "torr" : "skarp",
  orsak: torr ? "--torr" : null,
  modell: inst.modell, stil: inst.stil, storlek: inst.storlek, kvalitet: inst.kvalitet,
  regel: bara ? `bara ${bara}` : `${Math.round(andel * 100)} % av ${pool.length} artiklar (${alla ? "alla" : `senaste ${timmar} h`}) = ${mal} med bild, ${harBild} hade redan, högst ${max} nya`,
  antal: valda.length,
  uppskattadKostnadUSD: Math.round(valda.length * (UPPSKATTAD_KOSTNAD[inst.kvalitet] ?? 0.04) * 100) / 100,
  bilder: [],
  ren_text: textbeslut.map(({ a }) => a.slug),
};

for (const { f, a } of valda) {
  const motiv = rensaMotiv(a.bildmotiv, a.kategori);
  const post = { fil: f, slug: a.slug, kategori: a.kategori, poang: poang(a), motiv, prompt: byggPrompt(a.bildmotiv, a.kategori) };
  if (torr) { plan.bilder.push({ ...post, status: "planerad" }); continue; }
  const hittills = plan.bilder.reduce((s, b) => s + (b.kostnadUSD ?? 0) + (b.granskningUSD ?? 0), 0);
  if (hittills >= TAK) { plan.bilder.push({ ...post, status: "hoppad", fel: `bildtaket $${TAK} nått` }); continue; }
  try {
    // Alt-texten skrivs om utifrån själva bilden om skribentens förslag inte klarar reglerna (80–125 tecken m.m.).
    const bild = await hittaBild({
      slug: a.slug, sokord: a.bildsok ?? [], motiv: a.bildmotiv, kategori: a.kategori,
      alt: String(a.bildalt ?? "").replace(/^illustration:s*/i, ""),
      rubrik: a.rubrik, ingress: a.ingress, publicDir: PUBLIC, rymd: Boolean(a.bildRymd),
    });
    if (!bild) throw new Error("ingen bild");
    a.bild = bild;
    a.bildbeslut = "bild";
    writeFileSync(join(DIR, f), JSON.stringify(a, null, 2) + "\n");
    plan.bilder.push({ ...post, status: "skapad", typ: bild.illustration ? "illustration" : `foto (${bild.kalla})`, bild: bild.fil, kontroller: bild.kontroller, kostnadUSD: bild.kostnadUSD ?? 0, granskningUSD: bild.granskningUSD ?? 0 });
    console.log(`BILD ${a.slug} (${bild.illustration ? "illustration" : bild.kalla})`);
  } catch (e) {
    plan.bilder.push({ ...post, status: "misslyckad", fel: String(e.message || e) });
    console.warn(`Ingen bild för ${a.slug}: ${e.message}`);
  }
}

if (!torr) {
  for (const { f, a } of textbeslut) { a.bildbeslut = "text"; writeFileSync(join(DIR, f), JSON.stringify(a, null, 2) + "\n"); }
}

const summa = (k) => Math.round(plan.bilder.reduce((s, b) => s + (b[k] ?? 0), 0) * 10000) / 10000;
plan.kostnadIllustrationerUSD = summa("kostnadUSD");
plan.kostnadBildkontrollUSD = summa("granskningUSD");
plan.faktiskKostnadUSD = Math.round((plan.kostnadIllustrationerUSD + plan.kostnadBildkontrollUSD) * 10000) / 10000;
writeFileSync(join(RAW, "bildplan.json"), JSON.stringify(plan, null, 2) + "\n");
const skapade = plan.bilder.filter((b) => b.status === "skapad");
console.log(plan.regel);
console.log(torr
  ? `Torrläge (${plan.orsak}): ${plan.antal} artiklar skulle få bild, ${textbeslut.length} blir ren text. Prompterna finns i data/raw/bildplan.json.`
  : `${skapade.length} av ${plan.antal} bilder klara (${skapade.filter((b) => b.typ !== "illustration").length} fria foton), ${textbeslut.length} artiklar ren text. Kostnad enligt API:ts usage: $${plan.faktiskKostnadUSD} (illustrationer $${plan.kostnadIllustrationerUSD}, bildkontroll $${plan.kostnadBildkontrollUSD}).`);
