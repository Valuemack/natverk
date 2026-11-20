// Ser till att varje huvuddomän har en proxad CNAME (@ och www) mot sitt Pages-projekt.
import { cf, cfAlla, KONTO } from "./api.mjs";
import { domainToASCII } from "node:url";
import { HUVUD } from "./domaner.mjs";
const zoner = new Map((await cfAlla(`/zones?account.id=${KONTO}`)).map((z) => [domainToASCII(z.name), z]));
for (const d of HUVUD) {
  const z = zoner.get(d.ascii); if (!z) { console.log(`${d.namn}: zon saknas`); continue; }
  const p = await cf("GET", `/accounts/${KONTO}/pages/projects/${d.projekt}`);
  const mal = p.result.subdomain;
  const poster = await cfAlla(`/zones/${z.id}/dns_records`);
  const rad = [];
  for (const namn of [d.ascii, `www.${d.ascii}`]) {
    let finns = poster.find((r) => r.name === namn);
    // Platshållare (192.0.2.1) från när domänen bara omdirigerades ersätts med CNAME mot Pages.
    if (finns?.type === "A" && finns.content === "192.0.2.1") {
      for (const r of poster.filter((x) => x.name === namn && ["A", "AAAA"].includes(x.type))) await cf("DELETE", `/zones/${z.id}/dns_records/${r.id}`);
      finns = null;
    }
    if (finns) { rad.push(`${namn === d.ascii ? "@" : "www"}: finns (${finns.type} → ${finns.content})`); continue; }
    const j = await cf("POST", `/zones/${z.id}/dns_records`, { type: "CNAME", name: namn, content: mal, proxied: true, ttl: 1 });
    rad.push(`${namn === d.ascii ? "@" : "www"}: ${j.success ? `skapad → ${mal}` : `FEL ${JSON.stringify(j.errors)}`}`);
  }
  console.log(`${d.namn.padEnd(20)} ${rad.join(" | ")}`);
}
