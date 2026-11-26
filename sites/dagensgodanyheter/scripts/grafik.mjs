// Ritar sajtens egen grafik: favicon, logotyp i PNG (publisher.logo), standardbild för delning och ett
// typografiskt delningskort per avdelning (används när en artikel saknar bild). Ingen toning, inga symboler –
// bara namnvinjetten, linjer och text på papper, som en tidningsetta. Körs vid behov: node scripts/grafik.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { KATEGORIER } from "../src/lib/kategorier.js";
import { ORDBILD_VIEWBOX, ORDBILD_BREDD, ordbildFast, MONOGRAM } from "../src/lib/logga.js";
import { SLOGAN } from "../src/site.js";

const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const DELNING = join(PUB, "delning");
mkdirSync(DELNING, { recursive: true });
// De gamla tonade kategoribilderna används inte längre.
if (existsSync(join(PUB, "illustrationer"))) rmSync(join(PUB, "illustrationer"), { recursive: true });

const PAPPER = "#fbf9f5", BLACK = "#121212", ACCENT = "#0d5c3f", DAMPAD = "#5a5650";
const [vx, vy, vw, vh] = ORDBILD_VIEWBOX.split(" ").map(Number);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Namnvinjetten placerad i en 1280×720-yta, centrerad med given bredd och överkant. */
const vinjett = (bredd, topp) => {
  const skala = bredd / ORDBILD_BREDD;
  return `<g transform="translate(${(1280 - bredd) / 2 - vx * skala} ${topp - vy * skala}) scale(${skala})">${ordbildFast(BLACK, ACCENT)}</g>`;
};
const hojd = (bredd) => (vh * bredd) / vw;

const kort = (etikett, rad) => {
  const B = 980, T = 200, H = hojd(B);
  const linje = T + H + 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<rect width="1280" height="720" fill="${PAPPER}"/>
<rect x="60" y="60" width="1160" height="2" fill="${BLACK}"/>
${vinjett(B, T)}
<rect x="150" y="${linje}" width="980" height="3" fill="${BLACK}"/><rect x="150" y="${linje + 7}" width="980" height="1.2" fill="${BLACK}"/>
${etikett ? `<text x="640" y="${linje + 92}" text-anchor="middle" font-family="Libre Franklin, Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="34" letter-spacing="7" fill="${ACCENT}">${esc(etikett.toUpperCase())}</text>` : ""}
<text x="640" y="${linje + (etikett ? 150 : 100)}" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-style="italic" font-size="34" fill="${DAMPAD}">${esc(rad)}</text>
<rect x="60" y="658" width="1160" height="2" fill="${BLACK}"/>
</svg>`;
};

for (const k of KATEGORIER) {
  await sharp(Buffer.from(kort(k.namn, SLOGAN))).jpeg({ quality: 86, mozjpeg: true }).toFile(join(DELNING, `${k.slug}.jpg`));
}
await sharp(Buffer.from(kort("", SLOGAN))).jpeg({ quality: 86, mozjpeg: true }).toFile(join(PUB, "og-standard.jpg"));

// Favicon och logotyp: monogrammet G på accentfärg.
writeFileSync(join(PUB, "favicon.svg"), MONOGRAM());
await sharp(Buffer.from(MONOGRAM())).resize(512, 512).png().toFile(join(PUB, "logo-512.png"));
console.log(`Grafik klar: ${KATEGORIER.length} delningskort, og-standard.jpg, favicon.svg, logo-512.png`);
