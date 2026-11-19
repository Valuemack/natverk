// Kontrollerar att nycklarna fungerar och listar domänerna hos Loopia. Skriver aldrig ut nycklar.
import { cf, cfAlla, loopia, KONTO } from "./api.mjs";

const v = await cf("GET", "/user/tokens/verify");
console.log("Cloudflare-token:", v.success ? `giltig (${v.result?.status})` : `FEL ${JSON.stringify(v.errors)}`);
if (!v.success) {
  // Kontotokens verifieras mot kontot i stället för användaren.
  const v2 = await cf("GET", `/accounts/${KONTO}/tokens/verify`);
  console.log("  kontotoken:", v2.success ? `giltig (${v2.result?.status})` : `FEL ${JSON.stringify(v2.errors)}`);
}
const konto = await cf("GET", `/accounts/${KONTO}`);
console.log("Cloudflare-konto:", konto.success ? `hittat (${konto.result?.name ? "namn finns" : "utan namn"})` : `FEL ${JSON.stringify(konto.errors)}`);
try {
  const zoner = await cfAlla(`/zones?account.id=${KONTO}`);
  console.log("Domäner i Cloudflare redan:", zoner.length, zoner.map((z) => `${z.name} (${z.status})`).join(", "));
} catch (e) { console.log("Kunde inte lista zoner:", e.message); }

const d = await loopia("getDomains");
if (!Array.isArray(d)) { console.log("Loopia:", JSON.stringify(d)); process.exit(0); }
console.log(`Loopia: ${d.length} domäner`);
for (const x of d) console.log(`  ${x.domain}  registrerad=${x.registered}  betald=${x.paid}  förnyas=${x.expiration_date ?? "?"}`);
