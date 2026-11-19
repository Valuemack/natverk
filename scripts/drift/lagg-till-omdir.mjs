// Lägger till omdirigeringsdomänerna i Cloudflare med proxade platshållarposter (@ och www), så att en
// omdirigeringsregel kan svara. 192.0.2.1 är en reserverad dokumentationsadress som aldrig nås, eftersom proxyn svarar först.
import { domainToASCII } from "node:url";
import { cf, cfAlla, KONTO, vanta } from "./api.mjs";
import { OMDIR } from "./domaner.mjs";
const finns = new Map((await cfAlla(`/zones?account.id=${KONTO}`)).map((z) => [domainToASCII(z.name), z]));
for (const namn of Object.keys(OMDIR)) {
  const ascii = domainToASCII(namn);
  let z = finns.get(ascii);
  if (!z) {
    const j = await cf("POST", "/zones", { name: ascii, account: { id: KONTO }, type: "full", jump_start: false });
    if (!j.success) { console.log(`${namn}: FEL ${JSON.stringify(j.errors)}`); continue; }
    z = j.result; await vanta(1200);
  }
  const poster = await cfAlla(`/zones/${z.id}/dns_records`);
  for (const p of [ascii, `www.${ascii}`]) {
    if (!poster.some((r) => r.name === p)) await cf("POST", `/zones/${z.id}/dns_records`, { type: "A", name: p, content: "192.0.2.1", proxied: true, ttl: 1 });
  }
  console.log(`${namn.padEnd(22)} ${z.status.padEnd(8)} ${z.name_servers?.join(", ")}`);
}
