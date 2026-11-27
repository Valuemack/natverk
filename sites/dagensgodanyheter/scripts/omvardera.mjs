// Poängsätter publicerade artiklar på nytt (glädje, nyhetstyp, byråkratisk) med den billiga modellen.
// Ändrar bara poängfälten och typen – aldrig text, adress, datum eller kategori. Inga artiklar tas bort.
//
//   node scripts/omvardera.mjs            # bara artiklar som saknar glädjepoäng
//   node scripts/omvardera.mjs --alla     # alla artiklar
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { laddaEnv } from "./lib/env.mjs";
import { KALLOR } from "./kallor.mjs";

laddaEnv();
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY saknas."); process.exit(1); }
const { bedomKandidater } = await import("./lib/ai-poang.mjs");
const { viktadPoang } = await import("../src/lib/vikter.js");

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "artiklar");
const ALLA = process.argv.includes("--alla");
const filer = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const artiklar = filer.map((f) => ({ f, a: JSON.parse(readFileSync(join(DIR, f), "utf8")) })).filter(({ a }) => ALLA || a.poang?.gladje == null);
const kallnamn = Object.fromEntries(KALLOR.map((k) => [k.id, k.namn]));
const kandidater = artiklar.map(({ f, a }) => ({
  id: f, titel: a.rubrik, kallnamn: a.kalla?.namn ?? kallnamn[a.kalla?.id] ?? "okänd",
  sammanfattning: [a.ingress, a.avsnitt?.[0]?.stycken?.[0] ?? ""].join(" "),
}));
const { bedomda, kostnad } = await bedomKandidater(kandidater);
let n = 0;
for (const { f, a } of artiklar) {
  const b = bedomda.get(f);
  if (!b) continue;
  a.poang = { ...a.poang, positiv: b.positiv / 10, gladje: b.gladje / 10, betydelse: b.betydelse / 10 };
  delete a.poang.hopp;
  if (b.byrakratisk) a.poang.byrakratisk = true; else delete a.poang.byrakratisk;
  a.poang.total = viktadPoang({ ...a.poang, farskhet: 1 });
  a.typ = b.typ;
  writeFileSync(join(DIR, f), JSON.stringify(a, null, 2) + "\n");
  n++;
  console.log(`${String(b.gladje).padStart(2)} ${b.typ.padEnd(9)} ${b.byrakratisk ? "BYRÅKRATI " : ""}${a.rubrik.slice(0, 90)}`);
}
console.log(`${n} artiklar omvärderade, cirka $${kostnad.toFixed(4)}.`);
