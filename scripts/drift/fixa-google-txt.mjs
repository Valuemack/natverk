// Cloudflares Domain Connect lägger Googles verifieringspost fel för domäner med å/ä/ö:
// på "xn--x.nu.xn--x.nu" i stället för på "xn--x.nu". Flyttar sådana TXT-poster till domänens rot.
//   node --env-file=.env scripts/drift/fixa-google-txt.mjs
import { domainToASCII } from "node:url";
import { cf, cfAlla, KONTO } from "./api.mjs";

const zoner = await cfAlla(`/zones?account.id=${KONTO}`);
let antal = 0;
for (const z of zoner) {
  const apex = domainToASCII(z.name);
  const poster = (await cf("GET", `/zones/${z.id}/dns_records?type=TXT&per_page=100`)).result ?? [];
  for (const p of poster) {
    if (!p.content.includes("google-site-verification=") || p.name !== `${apex}.${apex}`) continue;
    antal++;
    const finns = poster.some((q) => q.name === apex && q.content === p.content);
    const r = finns
      ? await cf("DELETE", `/zones/${z.id}/dns_records/${p.id}`)
      : await cf("PATCH", `/zones/${z.id}/dns_records/${p.id}`, { name: apex });
    console.log(`${z.name}: ${finns ? "dubblett borttagen" : "flyttad till roten"} (${r.success ? "ok" : JSON.stringify(r.errors)})`);
  }
}
console.log(antal ? "Klart." : "Inga felplacerade poster hittades.");
