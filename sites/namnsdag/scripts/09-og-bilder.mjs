// Delningsbilder (OG/Twitter) för namnsidor, datumsidor och en standardbild → public/og/.
// Körs före bygget (npm run build → prebuild). Ritar bara om en bild när dess text ändrats
// (nyckel i data/og-manifest.json), så den nattliga ombyggnaden tar några sekunder i stället för minuter.
//   node scripts/09-og-bilder.mjs        – rita nya/ändrade
//   node scripts/09-og-bilder.mjs --om   – rita om allt
import { register } from "node:module";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ROT } from "./lib.mjs";

process.chdir(ROT); // sajtens moduler läser data/ relativt arbetskatalogen
register("../test/json-hook.mjs", import.meta.url); // site.js importerar JSON utan import-attribut (Vite-stil)
const { DAGAR, dagText, dagHref, namnPaDag, lista, UTAN_NAMN, helgnamn } = await import("../src/site.js");
const { NAMNSIDOR, sidNamn } = await import("../src/lib/namnsidor.js");
const { ogPng, FOT } = await import("../src/lib/ogbild.js");

const UT = join(ROT, "public", "og");
const MANIFEST = join(ROT, "data", "og-manifest.json");
const om = process.argv.includes("--om");
const gammal = !om && existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const ny = {};

const bilder = [{ fil: "standard.png", text: { ovan: "Vem har namnsdag idag?", stor: "Namnsdag idag", under: "Alla namnsdagar i almanackan – med statistik från SCB" } }];
for (const s of NAMNSIDOR) {
  const under = s.typ === "utan"
    ? "saknas i almanackan – firas 1 januari"
    : s.typ === "variant"
      ? `kan fira namnsdag ${dagText(s.n.datum)} (${s.n.namn}-dagen)`
      : `har namnsdag ${dagText(s.n.datum)}${s.n.fran ? ` från ${s.n.fran}` : ""}`;
  bilder.push({ fil: `namn/${s.slug}.png`, text: { ovan: "Grattis på namnsdagen", stor: sidNamn(s), under } });
}
for (const k of DAGAR) {
  const namn = namnPaDag(k).map((n) => n.namn);
  const text = namn.length
    ? { ovan: `Namnsdag ${dagText(k)}`, stor: lista(namn), under: "Grattis på namnsdagen!" }
    : { ovan: dagText(k), stor: "Ingen namnsdag", under: helgnamn(UTAN_NAMN[k]?.split(" –")[0] ?? "").replace(/^./, (c) => c.toUpperCase()) };
  bilder.push({ fil: `dag${dagHref(k).slice(0, -1)}.png`, text });
}

mkdirSync(join(UT, "namn"), { recursive: true });
mkdirSync(join(UT, "dag"), { recursive: true });
let ritade = 0;
for (const b of bilder) {
  const nyckel = JSON.stringify({ ...b.text, fot: FOT });
  ny[b.fil] = nyckel;
  if (gammal[b.fil] === nyckel && existsSync(join(UT, b.fil))) continue;
  writeFileSync(join(UT, b.fil), await ogPng(b.text));
  ritade++;
}
// Ta bort bilder för sidor som inte längre finns.
let borttagna = 0;
for (const mapp of ["namn", "dag"]) {
  for (const f of readdirSync(join(UT, mapp))) if (!ny[`${mapp}/${f}`]) { unlinkSync(join(UT, mapp, f)); borttagna++; }
}
writeFileSync(MANIFEST, JSON.stringify(ny));
console.log(`OG-bilder: ${bilder.length} totalt, ${ritade} ritade, ${borttagna} borttagna.`);
