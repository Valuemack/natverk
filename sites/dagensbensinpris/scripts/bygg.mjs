// dagensbensinpris.se är sedan 2026-11-27 en ren omdirigeringssajt: allt innehåll finns på bensinstationer.nu.
// Bygget skriver dist/_redirects med en äkta 301 per gammal URL (alla 372 från den sista sitemapen, data/gamla-url.txt)
// till den bästa nya sidan, plus en reservregel för okända adresser. Inga HTML-sidor publiceras.
// Cloudflare Pages följer alltid en matchande regel (även om en fil finns) och tillåter 2 000 statiska + 100 dynamiska regler.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NY = "https://bensinstationer.nu";

const DRIVMEDEL = { "bensin-95": "/bensinpris/", "bensin-98": "/drivmedel/bensin-98/", diesel: "/dieselpris/", e85: "/drivmedel/e85/", hvo100: "/drivmedel/hvo100/", fordonsgas: "/drivmedel/fordonsgas/" };

/** Bästa nya sökväg för en gammal sökväg på dagensbensinpris.se. */
export function nySokvag(u) {
  const d = u.split("/").filter(Boolean);
  if (!d.length) return "/"; // startsidan måste peka på nya startsidan, annars underkänner Search Consoles adressändring flytten
  if (d.length === 1 && DRIVMEDEL[d[0]]) return DRIVMEDEL[d[0]];
  if (d[0] === "ort") return d[1] ? `/${d[1]}/` : "/bensinpris/"; // bensinpris per kommun → kommunsidan (samma slugregel)
  if (["historik", "europa", "guider", "kedja"].includes(d[0])) return `/${d.join("/")}/`; // samma sökväg finns på bensinstationer.nu
  if (["om", "integritet", "rakna"].includes(d[0])) return `/${d[0]}/`;
  return "/bensinpris/";
}

// Adresser som inte stod i sitemapen men har funnits.
export const EXTRA = [
  ["/data/dagspriser.json", "/data/dagspriser.json"], ["/llms.txt", "/llms.txt"], ["/robots.txt", "/robots.txt"],
  ["/sitemap-index.xml", "/sitemap-index.xml"], ["/sitemap-0.xml", "/sitemap-index.xml"],
];

export function regler() {
  const gamla = fs.readFileSync(path.join(ROT, "data/gamla-url.txt"), "utf8").split(/\r?\n/).filter(Boolean);
  return [...gamla.map((u) => [u, nySokvag(u)]), ...EXTRA];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = regler();
  const dist = path.join(ROT, "dist");
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  const rader = [
    "# dagensbensinpris.se är sammanslagen med bensinstationer.nu (2026-11-27). Genereras av scripts/bygg.mjs.",
    ...r.map(([fran, till]) => `${fran} ${NY}${till} 301`),
    "# Okända adresser: dagens bensinpris.",
    `/* ${NY}/bensinpris/ 301`,
  ];
  fs.writeFileSync(path.join(dist, "_redirects"), rader.join("\n") + "\n");
  fs.copyFileSync(path.join(ROT, "public/_headers"), path.join(dist, "_headers"));
  // Pages kräver minst en fil att servera; sidan nås aldrig eftersom "/" omdirigeras.
  fs.writeFileSync(path.join(dist, "index.html"), `<!doctype html><meta charset="utf-8"><title>Dagens bensinpris finns nu på bensinstationer.nu</title><link rel="canonical" href="${NY}/bensinpris/"><p>Dagens bensinpris finns nu på <a href="${NY}/bensinpris/">bensinstationer.nu/bensinpris/</a>.</p>\n`);
  console.log(`_redirects: ${r.length} statiska regler + 1 reservregel → ${NY}`);
}
