// Lägger till nätverkets domäner i Cloudflare (Free-plan) och skriver ut namnservrarna. Hoppar över befintliga.
import { cf, cfAlla, KONTO, vanta } from "./api.mjs";
import { domainToASCII } from "node:url";
import { HUVUD } from "./domaner.mjs";
const finns = new Map((await cfAlla(`/zones?account.id=${KONTO}`)).map((z) => [domainToASCII(z.name), z]));
for (const d of HUVUD) {
  let z = finns.get(d.ascii);
  if (!z) {
    const j = await cf("POST", "/zones", { name: d.ascii, account: { id: KONTO }, type: "full", jump_start: false });
    if (!j.success) { console.log(`${d.namn}: FEL ${JSON.stringify(j.errors)}`); continue; }
    z = j.result; await vanta(1200);
  }
  console.log(`${d.namn.padEnd(20)} ${z.status.padEnd(8)} ${z.name_servers?.join(", ")}`);
}
