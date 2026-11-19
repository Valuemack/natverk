// Hämtar all data och bygger sajterna, en i taget. Körs här lokalt när vi arbetar, inte på schema.
//   node scripts/uppdatera.mjs                     # alla sajter: hämta all data och bygg
//   node scripts/uppdatera.mjs parkeringar komvux  # bara de uppräknade sajterna
//   node scripts/uppdatera.mjs --bara-bygg         # hoppa över datahämtningen
// Sajter som delar datakälla (parkeringar och lekplatserna) hämtar bara en gång.
// En sajt vars hämtning misslyckas byggs ändå från förra datan, och felet syns i sammanfattningen.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROT = resolve(fileURLToPath(import.meta.url), "..", "..");
const args = process.argv.slice(2);
const baraBygg = args.includes("--bara-bygg");
const valda = args.filter((a) => !a.startsWith("--"));

const sajter = readdirSync(join(ROT, "sites")).filter((s) => {
  const p = join(ROT, "sites", s, "package.json");
  if (!existsSync(p)) return false;
  return !!JSON.parse(readFileSync(p, "utf8")).scripts?.build;
}).filter((s) => !valda.length || valda.includes(s));

const kor = (cwd, kommando) => {
  const t0 = Date.now();
  const r = spawnSync(kommando, { cwd, stdio: "inherit", shell: true });
  return { ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) };
};

const hamtade = new Set();
const resultat = [];

// Gemensamt underlag som andra sajters hämtning läser: OSM-utdraget (bensinstationer, parkeringar, lekplatser).
const UNDERLAG = [{ namn: "osm-data", kommando: "node scripts/run.mjs", for: ["bensinstationer", "parkeringar", "lekplatserna"] }];
if (!baraBygg) for (const u of UNDERLAG.filter((u) => u.for.some((s) => sajter.includes(s)))) {
  console.log(`\n### underlag ${u.namn}: hämtar`);
  const r = kor(join(ROT, "sites", u.namn), u.kommando);
  resultat.push({ sajt: `(${u.namn})`, data: `${r.ok ? "OK" : "FEL"} ${r.s} s`, bygg: "–" });
}
for (const s of sajter) {
  const dir = join(ROT, "sites", s);
  const data = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.data;
  const rad = { sajt: s, data: "–", bygg: "–" };
  if (data && !baraBygg) {
    // Samma skript från två sajter (t.ex. ../parkering-lek/scripts/run-all.mjs) körs bara en gång.
    const nyckel = data.replace(/(\.\.?\/[^\s]+)/g, (m) => resolve(dir, m));
    if (hamtade.has(nyckel)) rad.data = "delad, redan hämtad";
    else {
      console.log(`\n### ${s}: hämtar data (${data})`);
      const r = kor(dir, "npm run data");
      hamtade.add(nyckel);
      rad.data = `${r.ok ? "OK" : "FEL"} ${r.s} s`;
    }
  }
  console.log(`\n### ${s}: bygger`);
  const b = kor(dir, "npx astro build");
  rad.bygg = `${b.ok ? "OK" : "FEL"} ${b.s} s`;
  resultat.push(rad);
}

console.log("\nSammanfattning");
console.table(resultat);
if (resultat.some((r) => r.bygg.startsWith("FEL"))) process.exit(1);
