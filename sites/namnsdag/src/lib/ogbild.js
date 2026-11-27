// Delningsbilder (OG/Twitter, 1200×630 PNG) ritas som SVG och rasteriseras med sharp av
// scripts/09-og-bilder.mjs (körs före bygget, ritar bara om bilder vars innehåll ändrats).
// Ingen AI-bild: bara sajtens färger, girlang och text. Typsnitt: Georgia/Segoe UI med fallback till
// DejaVu/Liberation om bygget körs på Linux.
import sharp from "sharp";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SERIF = "Georgia, 'DejaVu Serif', 'Liberation Serif', serif";
const SANS = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
const FLAGGOR = ["#7a2e5a", "#e9a6c4", "#d9a441", "#b56a92"];

/** Teckenstorlek som får texten att rymmas på ~1 040 px bredd. */
const storlek = (text, max, faktor) => Math.round(Math.min(max, 1040 / Math.max(1, [...text].length * faktor)));

export const FOT = "namnsdagaridag.se";

export async function ogPng({ ovan = "", stor, under = "", fot = FOT }) {
  const s = storlek(stor, 150, 0.56);
  const u = storlek(under, 46, 0.5);
  const girlang = Array.from({ length: 12 }, (_, i) => {
    const x = 50 + i * 100, y = i % 2 ? 40 : 52;
    return `<path d="M${x} ${y} l26 0 l-13 46 z" fill="${FLAGGOR[i % 4]}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbf6f8"/>
  <path d="M0 30 Q150 90 300 40 T600 40 T900 40 T1200 30" fill="none" stroke="#7a2e5a" stroke-width="3" opacity=".5"/>
  ${girlang}
  <circle cx="110" cy="520" r="9" fill="#e9a6c4"/><circle cx="1090" cy="200" r="8" fill="#d9a441"/><circle cx="1040" cy="500" r="6" fill="#b56a92"/>
  ${ovan ? `<text x="600" y="205" font-family="${SANS}" font-size="38" fill="#5f5d66" text-anchor="middle">${esc(ovan)}</text>` : ""}
  <text x="600" y="${ovan ? 345 : 320}" font-family="${SERIF}" font-size="${s}" font-weight="700" fill="#7a2e5a" text-anchor="middle">${esc(stor)}</text>
  ${under ? `<text x="600" y="${ovan ? 425 : 405}" font-family="${SANS}" font-size="${u}" fill="#1c1b1f" text-anchor="middle">${esc(under)}</text>` : ""}
  <rect x="0" y="560" width="1200" height="70" fill="#7a2e5a"/>
  <text x="600" y="606" font-family="${SANS}" font-size="30" font-weight="600" fill="#ffffff" text-anchor="middle">${esc(fot)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png({ palette: true, colours: 48, compressionLevel: 9, effort: 8 }).toBuffer();
}
