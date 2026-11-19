// Skapar ett Cloudflare Pages-projekt per sajt (produktionsgren main) och kopplar huvuddomänen. Hoppar över det som finns.
import { cf, KONTO, vanta } from "./api.mjs";
import { HUVUD } from "./domaner.mjs";
const bas = `/accounts/${KONTO}/pages/projects`;
for (const d of HUVUD) {
  let p = await cf("GET", `${bas}/${d.projekt}`);
  if (!p.success) {
    p = await cf("POST", bas, { name: d.projekt, production_branch: "main" });
    if (!p.success) { console.log(`${d.projekt}: FEL vid skapande ${JSON.stringify(p.errors)}`); continue; }
    await vanta(800);
  }
  const dom = await cf("GET", `${bas}/${d.projekt}/domains`);
  let status = dom.result?.find((x) => x.name === d.ascii)?.status;
  if (!status) {
    const ny = await cf("POST", `${bas}/${d.projekt}/domains`, { name: d.ascii });
    status = ny.success ? ny.result.status : `FEL ${JSON.stringify(ny.errors)}`;
    await vanta(800);
  }
  console.log(`${d.projekt.padEnd(16)} ${p.result.subdomain.padEnd(28)} ${d.namn.padEnd(20)} ${status}`);
}
