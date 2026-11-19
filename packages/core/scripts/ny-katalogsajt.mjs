// Skapar skelettet till en katalogsajt (sites/<mapp>/) från en konfig-fil.
//   node packages/core/scripts/ny-katalogsajt.mjs sites/<mapp>/sajt.config.json
// Befintliga filer skrivs inte över (utom med --skriv-over), så sajtspecifika ändringar ligger kvar.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { faviconSvg } from "../src/teman.js";

const konfigFil = process.argv[2];
const skrivOver = process.argv.includes("--skriv-over");
const c = JSON.parse(readFileSync(konfigFil, "utf8"));
const rot = dirname(konfigFil);
const Plur = c.ord.plur[0].toUpperCase() + c.ord.plur.slice(1);

function skriv(fil, innehall) {
  const p = join(rot, fil);
  if (existsSync(p) && !skrivOver) return console.log(`  finns: ${fil}`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, innehall.replace(/^\n/, ""));
  console.log(`  skrev: ${fil}`);
}

skriv("package.json", JSON.stringify({
  name: c.mapp, private: true, type: "module",
  scripts: { dev: "astro dev", build: "astro build", preview: "astro preview", ...(c.dataSkript && { data: c.dataSkript }) },
  dependencies: { "@astrojs/sitemap": "^3.7.6", "@natverk/core": "*", astro: "^7.4.13" },
}, null, 2) + "\n");

skriv("astro.config.mjs", `
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "${c.url}",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({ filter: (url) => !url.includes("/integritet/") })],
});
`);

skriv("src/site.js", `
import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog } from "@natverk/core/katalog.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = ${JSON.stringify(c.ord)};
export const SCHEMA_TYP = "${c.schemaTyp}";
export const TITEL_ORD = "${c.titelOrd ?? "öppettider"}";
export const KALLA = ${JSON.stringify(c.kallaText)};

export const KAT = laddaKatalog("${c.datafil}"${c.harEgenSida ? `, { harEgenSida: ${c.harEgenSida} }` : ""});

export const SITE = {
  tema: "${c.tema ?? "kalender"}",
  tagline: ${JSON.stringify(c.tagline ?? null)},
  tjanstText: ${JSON.stringify(c.tjanstText ?? null)},
  kallor: ${JSON.stringify(c.kallor ?? [])},
  namn: ${JSON.stringify(c.namn)},
  visningsnamn: ${JSON.stringify(c.visningsnamn)},
  url: "${c.url}",
  beskrivning: ${JSON.stringify(c.beskrivning)},
  organisation: ${JSON.stringify(c.visningsnamn)},
  farg: "${c.farg}",
  meny: ${JSON.stringify(c.meny ?? [{ namn: "Alla län", href: "/#lan" }, { namn: "Om", href: "/om/" }])},
  sidfot: [
    { namn: "Om ${c.visningsnamn}", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: ${JSON.stringify(c.sidfotText ?? c.kallaText)},
  natverk: [],
};
`);

skriv("src/pages/[kommun]/index.astro", `
---
import KatalogKommun from "@natverk/core/katalog/KatalogKommun.astro";
import { SITE, KAT, ORD, UPPDATERAD, KALLA, TITEL_ORD } from "../../site.js";

export const getStaticPaths = () => KAT.kommuner.map((k) => ({ params: { kommun: k.slug }, props: { kommun: k } }));
const { kommun } = Astro.props;
---
<KatalogKommun site={SITE} kat={KAT} kommun={kommun} ord={ORD} uppdaterad={UPPDATERAD} kallaText={KALLA} titelOrd={TITEL_ORD} />
`);

skriv("src/pages/[kommun]/[enhet]/index.astro", `
---
import KatalogEnhet from "@natverk/core/katalog/KatalogEnhet.astro";
import { SITE, KAT, ORD, SCHEMA_TYP, UPPDATERAD, KALLA, TITEL_ORD } from "../../../site.js";

export const getStaticPaths = () => KAT.enheter.filter((e) => e.egenSida)
  .map((e) => ({ params: { kommun: e.kommunSlug, enhet: e.slug }, props: { enhet: e } }));
const { enhet } = Astro.props;
---
<KatalogEnhet site={SITE} kat={KAT} enhet={enhet} ord={ORD} schemaTyp={SCHEMA_TYP} uppdaterad={UPPDATERAD} kallaText={KALLA} titelOrd={TITEL_ORD} />
`);

skriv("src/pages/lan/[lan]/index.astro", `
---
import KatalogLan from "@natverk/core/katalog/KatalogLan.astro";
import { SITE, KAT, ORD, UPPDATERAD, KALLA } from "../../../site.js";

export const getStaticPaths = () => KAT.lan.map((l) => ({ params: { lan: l.slug }, props: { lan: l } }));
const { lan } = Astro.props;
---
<KatalogLan site={SITE} kat={KAT} lan={lan} ord={ORD} uppdaterad={UPPDATERAD} kallaText={KALLA} />
`);

skriv("src/pages/index.astro", `
---
import Layout from "@natverk/core/Layout.astro";
import Annons from "@natverk/core/Annons.astro";
import Faq from "@natverk/core/Faq.astro";
import HittaNarmaste from "@natverk/core/katalog/HittaNarmaste.astro";
import { faqLd, websiteLd } from "@natverk/core/seo.js";
import { harOppettider, oppetHelg } from "@natverk/core/katalog.js";
import { SITE, KAT, ORD, UPPDATERAD, KALLA } from "../site.js";

const Plur = ORD.plur[0].toUpperCase() + ORD.plur.slice(1);
const n = KAT.enheter.length;
const sondag = KAT.enheter.filter((e) => oppetHelg(e, "sun") === true).length;
const storst = [...KAT.kommuner].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 12);
const fragor = [
  { fraga: \`Hur många \${ORD.plur} finns det i Sverige?\`, svar: \`Vi listar \${n} \${ORD.plur} i \${KAT.kommuner.length} kommuner. Listan uppdateras varje natt.\` },
  storst[0] && { fraga: \`Vilken kommun har flest \${ORD.plur}?\`, svar: \`\${storst[0].namn} har flest med \${storst[0].enheter.length} st, följt av \${storst.slice(1, 3).map((k) => \`\${k.namn} (\${k.enheter.length})\`).join(" och ")}.\` },
].filter(Boolean);
---
<Layout site={SITE} titel=${JSON.stringify(c.startTitel)}
  beskrivning={\`Hitta \${ORD.plur} nära dig – alla \${n} i Sverige med adress och öppettider. ✓ Öppet nu ✓ Närmaste \${ORD.sing} ✓ Uppdateras varje natt.\`}
  jsonld={[websiteLd(SITE), faqLd(fragor)]} uppdaterad={UPPDATERAD}>
  <h1>${c.startH1 ?? `${Plur} i Sverige`}</h1>
  <p class="svar">Här finns <strong>{n} {ORD.plur}</strong> i {KAT.kommuner.length} kommuner med adress{KAT.enheter.some(harOppettider) && " och öppettider"}.{sondag > 0 && <> <strong>{sondag}</strong> har öppet på söndagar.</>}</p>
  <HittaNarmaste ord={ORD} />

  <h2>Flest {ORD.plur}</h2>
  <div class="kort">{storst.map((k) => <a href={k.href}><strong>{Plur} i {k.namn}</strong><small>{k.enheter.length} st</small></a>)}</div>

  <Annons plats="start-1" />

  <h2 id="lan">{Plur} per län och kommun</h2>
  {KAT.lan.map((l) => (
    <>
      <h3><a href={l.href}>{l.namn}</a> <small>({l.antal})</small></h3>
      <ul class="kolumner">{l.kommuner.map((k) => <li><a href={k.href}>{k.namn}</a> ({k.enheter.length})</li>)}</ul>
    </>
  ))}

  <Annons plats="start-2" />
  <Faq fragor={fragor} />
  <p class="kalla">{KALLA}</p>
</Layout>
`);

skriv("src/pages/narmaste.json.js", `
import { narmasteJson } from "@natverk/core/katalog.js";
import { KAT } from "../site.js";

export const GET = () => new Response(narmasteJson(KAT), { headers: { "Content-Type": "application/json" } });
`);

skriv("src/pages/robots.txt.js", `
import { robotsTxt } from "@natverk/core/seo.js";
import { SITE } from "../site.js";

export const GET = () => new Response(robotsTxt(SITE), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
`);

skriv("src/pages/llms.txt.js", `
import { SITE, KAT, ORD, UPPDATERAD, KALLA } from "../site.js";

export function GET() {
  const storst = [...KAT.kommuner].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 25);
  const rader = [
    \`# \${SITE.visningsnamn}\`, "", \`> \${SITE.beskrivning}\`, "",
    \`Uppdaterad: \${UPPDATERAD}. \${KAT.enheter.length} \${ORD.plur} i \${KAT.kommuner.length} kommuner. \${KALLA}\`, "",
    "## Län", ...KAT.lan.map((l) => \`- [\${l.namn}](\${SITE.url}\${l.href}): \${l.antal} \${ORD.plur}\`), "",
    "## Största kommunerna", ...storst.map((k) => \`- [\${k.namn}](\${SITE.url}\${k.href}): \${k.enheter.length} \${ORD.plur}\`), "",
    \`- [Om och källor](\${SITE.url}/om/)\`,
  ];
  return new Response(rader.join("\\n") + "\\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
`);

skriv("src/pages/om.astro", `
---
import Layout from "@natverk/core/Layout.astro";
import { SITE, KAT, ORD, UPPDATERAD, KALLA } from "../site.js";
---
<Layout site={SITE} titel={\`Om \${SITE.visningsnamn} – källor och metod\`}
  beskrivning={\`Så samlar \${SITE.visningsnamn} in uppgifter om \${ORD.plur} i Sverige: källor, uppdatering och rättelser.\`}
  smulor={[{ namn: "Start", href: "/" }, { namn: "Om", href: "/om/" }]} uppdaterad={UPPDATERAD}>
  <h1>Om {SITE.visningsnamn}</h1>
  <p class="ingress">{SITE.beskrivning}</p>
  <h2 id="kallor">Källor och metod</h2>
  <p>{KALLA}</p>
  <p>Just nu listar vi {KAT.enheter.length} {ORD.plur} i {KAT.kommuner.length} kommuner. Uppgifterna hämtas och kontrolleras automatiskt varje natt. Öppettider kan avvika vid helgdagar – kontrollera gärna med verksamheten innan du åker.</p>
  <h2 id="kontakt">Kontakt och rättelser</h2>
  <p>Har du hittat ett fel eller saknas något? Hör av dig så rättar vi det.</p>
</Layout>
`);

skriv("src/pages/integritet.astro", `
---
import Layout from "@natverk/core/Layout.astro";
import { SITE, UPPDATERAD } from "../site.js";
---
<Layout site={SITE} titel={\`Integritet och cookies – \${SITE.visningsnamn}\`}
  beskrivning={\`Hur \${SITE.visningsnamn} hanterar cookies, annonser och personuppgifter.\`}
  smulor={[{ namn: "Start", href: "/" }, { namn: "Integritet och cookies", href: "/integritet/" }]} uppdaterad={UPPDATERAD} noindex>
  <h1>Integritet och cookies</h1>
  <p>{SITE.visningsnamn} kräver ingen inloggning och sparar inga personuppgifter om dig i egna system. Funktionen "Hitta närmaste" använder din position bara i din egen webbläsare – den skickas aldrig till oss.</p>
  <h2>Annonser och cookies</h2>
  <p>Sajten finansieras med annonser från Google AdSense. Google och dess partner kan använda cookies för att visa och mäta annonser, och – om du samtycker – för att anpassa dem efter dina intressen. Du väljer själv i samtyckesrutan som visas vid första besöket och kan ändra ditt val via länken "Cookieinställningar" längst ner på sidan.</p>
  <p>Läs mer: <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow">policies.google.com/technologies/partner-sites</a>.</p>
  <h2>Statistik</h2>
  <p>Vi mäter anonymt hur sajten används för att kunna förbättra den.</p>
</Layout>
`);

skriv("src/pages/404.astro", `
---
import Layout from "@natverk/core/Layout.astro";
import { SITE, KAT, ORD } from "../site.js";
const storst = [...KAT.kommuner].sort((a, b) => b.enheter.length - a.enheter.length).slice(0, 6);
---
<Layout site={SITE} titel={\`Sidan finns inte – \${SITE.visningsnamn}\`} beskrivning="Sidan du sökte finns inte." noindex>
  <h1>Sidan finns inte</h1>
  <p>Sidan kan ha flyttats eller tagits bort. Gå till <a href="/">startsidan</a> eller välj en kommun:</p>
  <div class="lank-rad">{storst.map((k) => <a href={k.href}>{k.namn}</a>)}</div>
</Layout>
`);

skriv("public/favicon.svg", faviconSvg(c.tema ?? "kalender"));

skriv("public/_headers", readFileSync(new URL("../src/_headers", import.meta.url), "utf8"));

console.log(`Klart: ${rot}`);
