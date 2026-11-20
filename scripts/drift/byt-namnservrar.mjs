// Byter namnservrar hos Loopia till Cloudflares för nätverkets domäner, men bara där DNSSEC (DS-posten) är borta.
// Domäner som redan pekar på Cloudflare hoppas över. Kör om tills alla är klara.
//   node --env-file=.env scripts/drift/byt-namnservrar.mjs            # byter de som är redo
//   node --env-file=.env scripts/drift/byt-namnservrar.mjs --vakta     # försöker var 10:e minut i upp till 24 timmar
import { domainToASCII } from "node:url";
import { cf, cfAlla, loopia, KONTO, vanta } from "./api.mjs";
import { HUVUD, OMDIR, dns } from "./domaner.mjs";

const alla = [...HUVUD.map((d) => d.namn), ...Object.keys(OMDIR)];
const vakta = process.argv.includes("--vakta");

async function runda() {
  const zoner = new Map((await cfAlla(`/zones?account.id=${KONTO}`)).map((z) => [domainToASCII(z.name), z]));
  const loopiaNamn = new Map((await loopia("getDomains")).map((x) => [domainToASCII(x.domain), x.domain]));
  let kvar = 0;
  const rader = [];
  for (const namn of alla) {
    const ascii = domainToASCII(namn);
    const z = zoner.get(ascii);
    const cfNs = z?.name_servers ?? [];
    const [ns, ds] = await Promise.all([dns(ascii, "NS"), dns(ascii, "DS")]);
    const nu = ns.svar.map((x) => x.replace(/\.$/, "").toLowerCase());
    if (cfNs.length && cfNs.every((x) => nu.includes(x))) { rader.push(`${namn}: pekar redan på Cloudflare (${z.status})`); continue; }
    if (!z || !cfNs.length) { kvar++; rader.push(`${namn}: zon saknas i Cloudflare`); continue; }
    if (ds.svar.length) { kvar++; rader.push(`${namn}: väntar, DNSSEC finns kvar`); continue; }
    const lnamn = loopiaNamn.get(ascii);
    if (!lnamn) { kvar++; rader.push(`${namn}: finns inte på Loopia-kontot`); continue; }
    const svar = await loopia("updateDNSServers", lnamn, cfNs);
    if (svar === "OK") {
      rader.push(`${namn}: BYTT till ${cfNs.join(", ")}`);
      await cf("PUT", `/zones/${z.id}/activation_check`); // be Cloudflare kontrollera direkt
    } else { kvar++; rader.push(`${namn}: FEL från Loopia ${JSON.stringify(svar)}`); }
    await vanta(1500);
  }
  console.log(`\n${new Date().toLocaleString("sv-SE")}`);
  for (const r of rader) console.log("  " + r);
  return kvar;
}

// Ett nätverksfel (t.ex. när datorn somnar) ska inte stoppa vakten: räkna rundan som ej klar och försök igen.
async function sakerRunda() {
  try { return await runda(); } catch (e) { console.log(`\n${new Date().toLocaleString("sv-SE")}  nätverksfel: ${e.cause?.code ?? e.message}, försöker igen`); return Infinity; }
}

let kvar = await sakerRunda();
if (vakta) {
  const slut = Date.now() + 72 * 3600 * 1000;
  while (kvar > 0 && Date.now() < slut) { await vanta(10 * 60 * 1000); kvar = await sakerRunda(); }
}
console.log(kvar ? `\n${kvar} domäner återstår.` : "\nALLA KLARA: samtliga domäner pekar på Cloudflare.");
