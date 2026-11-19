// Räknar fram en pollenkalender per mätort och pollenslag ur Naturhistoriska riksmuseets uppmätta dygnsvärden.
// Körs sällan (en gång per år räcker): hämtar säsongerna FRAN_AR–TILL_AR en gång, cachar råsvaren i data/raw/
// och skriver bara aggregatet till data/pollenkalender.json.
//
// Körning:  node scripts/pollenkalender.mjs [--fran 2021] [--till 2025]
// Licens: uppmätta halter är CC BY-SA 4.0. Aggregatet är ett bearbetat verk och sprids under samma licens.
// Hämtningsregler: dokumenterat API, 1 anrop/s, generisk User-Agent, cache så att inget hämtas två gånger.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DATA, UA } from "./lib.mjs";

const API = "https://api.pollenrapporten.se/v1";
const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : d);
const FRAN_AR = arg("--fran", 2021), TILL_AR = arg("--till", 2025);
const RAW = join(DATA, "raw", "pollen-count");

let senast = 0;
async function hamta(url) {
  for (let forsok = 0; ; forsok++) {
    const vanta = senast + 1100 - Date.now();
    if (vanta > 0) await new Promise((r) => setTimeout(r, vanta));
    senast = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return res.json();
      if ((res.status === 429 || res.status >= 500) && forsok < 4) { await new Promise((r) => setTimeout(r, 3000 * 2 ** forsok)); continue; }
      throw new Error(`HTTP ${res.status} för ${url}`);
    } catch (e) {
      if (forsok >= 4) throw e;
      await new Promise((r) => setTimeout(r, 3000 * 2 ** forsok));
    }
  }
}

async function hamtaAr(ar) {
  const fil = join(RAW, `${ar}.json`);
  if (existsSync(fil)) return JSON.parse(await readFile(fil, "utf8"));
  const rader = [];
  // Månad för månad håller svaren små; säsongen är januari–oktober.
  for (let m = 1; m <= 10; m++) {
    const start = `${ar}-${String(m).padStart(2, "0")}-01`;
    const slut = new Date(Date.UTC(ar, m, 0)).toISOString().slice(0, 10);
    let offset = 0;
    for (;;) {
      const qs = new URLSearchParams({ start_date: start, end_date: slut, offset: String(offset), limit: "1000" });
      const d = await hamta(`${API}/pollen-count?${qs}`);
      for (const c of d.items ?? []) {
        if (c.technicalError === true || c.dailyCount == null) continue;
        rader.push([String(c.date).slice(0, 10), c.regionId, c.pollenId, c.dailyCount]);
      }
      offset += (d.items ?? []).length;
      if (!d.items?.length || offset >= (d._meta?.totalRecords ?? offset)) break;
    }
    console.log(`${ar}-${m}: ${rader.length} värden`);
  }
  await mkdir(RAW, { recursive: true });
  await writeFile(fil, JSON.stringify(rader));
  return rader;
}

// ISO-vecka för ett datum (YYYY-MM-DD).
function isoVecka(datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const forsta = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - forsta) / 864e5 - 3 + ((forsta.getUTCDay() + 6) % 7)) / 7);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const regioner = JSON.parse(await readFile(join(DATA, "pollen-regioner.json"), "utf8"));
const { typer } = JSON.parse(await readFile(join(DATA, "pollen-typer.json"), "utf8"));
const allaRader = [];
const arMedData = [];
for (let ar = FRAN_AR; ar <= TILL_AR; ar++) {
  const r = await hamtaAr(ar);
  if (r.length) arMedData.push(ar);
  allaRader.push(...r.map((x) => [...x, ar]));
}

// Gruppera: region -> pollen -> år -> [datum, värde]
const grupp = new Map();
for (const [datum, reg, pol, v, ar] of allaRader) {
  const k = `${reg}|${pol}`;
  if (!grupp.has(k)) grupp.set(k, new Map());
  const perAr = grupp.get(k);
  if (!perAr.has(ar)) perAr.set(ar, []);
  perAr.get(ar).push([datum, v]);
}

const kalender = [];
for (const reg of regioner.filter((r) => !r.hela_landet)) {
  for (const typ of typer) {
    const perAr = grupp.get(`${reg.id}|${typ.id}`);
    if (!perAr) continue;
    const lag = typ.gransvarden?.lag ?? 10, mattlig = typ.gransvarden?.mattlig ?? 100;
    const sasonger = [];
    const veckor = new Map(); // vecka -> dygnsvärden alla år
    for (const [ar, rader] of perAr) {
      rader.sort(([a], [b]) => a.localeCompare(b));
      const summa = rader.reduce((s, [, v]) => s + v, 0);
      if (rader.length < 60 || summa === 0) continue; // för få mätdagar eller inget pollen alls det året
      // Säsong = dagarna mellan 5 % och 95 % av årets totala pollenmängd (vanlig definition i aerobiologin).
      let ack = 0, start = null, slut = null, topp = rader[0];
      for (const r of rader) {
        ack += r[1];
        if (start == null && ack >= 0.05 * summa) start = r[0];
        if (slut == null && ack >= 0.95 * summa) slut = r[0];
        if (r[1] > topp[1]) topp = r;
      }
      sasonger.push({
        ar, start, slut, topp_datum: topp[0], topp_varde: topp[1], summa,
        dagar_over_mattlig: rader.filter(([, v]) => v > mattlig).length,
        dagar_over_lag: rader.filter(([, v]) => v > lag).length,
      });
      for (const [d, v] of rader) {
        const w = isoVecka(d);
        if (!veckor.has(w)) veckor.set(w, []);
        veckor.get(w).push(v);
      }
    }
    if (!sasonger.length) continue;
    const dagNr = (d) => { const x = new Date(`${d}T12:00:00Z`); return Math.round((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5); };
    const datumAvDagNr = (n) => new Date(Date.UTC(2025, 0, 1) + n * 864e5).toISOString().slice(5, 10); // MM-DD i ett normalår
    const medianDag = (falt) => datumAvDagNr(Math.round(median(sasonger.map((s) => dagNr(s[falt])))));
    kalender.push({
      region: reg.namn, region_slug: reg.slug, pollen: typ.namn, pollen_slug: typ.slug,
      antal_ar: sasonger.length,
      typisk_start: medianDag("start"), typisk_topp: medianDag("topp_datum"), typiskt_slut: medianDag("slut"),
      dagar_over_mattlig_snitt: Math.round(sasonger.reduce((s, x) => s + x.dagar_over_mattlig, 0) / sasonger.length),
      hogsta_dygnsvarde: Math.max(...sasonger.map((s) => s.topp_varde)),
      ar: sasonger,
      // Medianvärde per ISO-vecka över alla år (för kalenderdiagram).
      veckor: [...veckor.entries()].sort(([a], [b]) => a - b).map(([v, x]) => [v, Math.round(median(x))]),
    });
  }
}

await writeFile(join(DATA, "pollenkalender.json"), JSON.stringify({
  _meta: {
    skapad: new Date().toISOString(),
    kalla: "Palynologiska laboratoriet, Naturhistoriska riksmuseet",
    api: API,
    licens: "CC BY-SA 4.0 (bearbetat verk av uppmätta halter)",
    ar: arMedData,
    metod: "Säsong = dagarna mellan 5 % och 95 % av årets totala pollenmängd. Typiska datum = median över åren. Tekniska fel är borttagna.",
  },
  kalender,
}, null, 1));
console.log(`Klart: ${kalender.length} kombinationer av ort och pollenslag, år ${arMedData.join(", ")}`);
