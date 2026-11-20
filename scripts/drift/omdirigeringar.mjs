// Alla 301-omdirigeringar i nätverket via Cloudflare Bulk Redirects (en lista + en regel på kontot):
//   - www.<huvuddomän>          → https://<huvuddomän>      (sökvägen behålls)
//   - <projekt>.pages.dev       → https://<huvuddomän>      (sökvägen behålls, även förhandsadresser)
//   - omdirigeringsdomänerna (+ www) → målet i OMDIR
// Körs om när som helst: listan ersätts helt och regeln skapas om den saknas.
//   node --env-file=.env scripts/drift/omdirigeringar.mjs
import { domainToASCII } from "node:url";
import { cf, KONTO, vanta } from "./api.mjs";
import { HUVUD, OMDIR } from "./domaner.mjs";

const LISTA = "natverk_omdirigeringar";
const bas = { status_code: 301, preserve_query_string: true, subpath_matching: true };
const post = (kalla, mal, { behallSokvag = true, underdomaner = false } = {}) => ({
  redirect: { ...bas, source_url: kalla, target_url: mal, preserve_path_suffix: behallSokvag, include_subdomains: underdomaner },
});

// Pages-adressen kan skilja sig från projektnamnet (t.ex. bensinstationer-bm0.pages.dev), så den läses från API:t.
const projekt = new Map();
for (let sida = 1; ; sida++) {
  const r = await cf("GET", `/accounts/${KONTO}/pages/projects?page=${sida}&per_page=10`);
  for (const p of r.result ?? []) projekt.set(p.name, p.subdomain);
  if (!r.result?.length || r.result.length < 10) break;
}

const poster = [];
for (const d of HUVUD) {
  poster.push(post(`www.${d.ascii}/`, `https://${d.ascii}/`));
  const sub = projekt.get(d.projekt);
  if (!sub) { console.log(`VARNING: Pages-projektet ${d.projekt} hittades inte`); continue; }
  poster.push(post(`${sub}/`, `https://${d.ascii}/`, { underdomaner: true }));
}
for (const [namn, mal] of Object.entries(OMDIR)) {
  const ascii = domainToASCII(namn);
  // Ren domänvariant (forskolor.nu → förskolor.nu) behåller sökvägen; övriga leder till en landningssida.
  const behallSokvag = new URL(mal).pathname === "/" && ["forskolor.nu", "badstrander.se", "pollenlaget.se"].includes(namn);
  const malUrl = mal.endsWith("/") ? mal : `${mal}/`;
  poster.push(post(`${ascii}/`, malUrl, { behallSokvag }));
  poster.push(post(`www.${ascii}/`, malUrl, { behallSokvag }));
}

// 1. Listan
const listor = (await cf("GET", `/accounts/${KONTO}/rules/lists`)).result ?? [];
let lista = listor.find((l) => l.name === LISTA);
if (!lista) {
  const r = await cf("POST", `/accounts/${KONTO}/rules/lists`, { name: LISTA, kind: "redirect", description: "www, pages.dev och omdirigeringsdomäner" });
  if (!r.success) throw new Error("Kunde inte skapa listan: " + JSON.stringify(r.errors));
  lista = r.result;
  console.log("Lista skapad.");
}
const ers = await cf("PUT", `/accounts/${KONTO}/rules/lists/${lista.id}/items`, poster);
if (!ers.success) throw new Error("Kunde inte fylla listan: " + JSON.stringify(ers.errors));
const op = ers.result?.operation_id;
for (let i = 0; op && i < 30; i++) {
  const s = (await cf("GET", `/accounts/${KONTO}/rules/lists/bulk_operations/${op}`)).result;
  if (s?.status === "completed") { console.log(`Listan har ${poster.length} omdirigeringar.`); break; }
  if (s?.status === "failed") throw new Error("Listan misslyckades: " + s.error);
  await vanta(2000);
}

// 2. Regeln som använder listan
const fas = `/accounts/${KONTO}/rulesets/phases/http_request_redirect/entrypoint`;
const regel = {
  description: "Nätverkets omdirigeringar",
  expression: `http.request.full_uri in $${LISTA}`,
  action: "redirect",
  action_parameters: { from_list: { name: LISTA, key: "http.request.full_uri" } },
};
const nu = await cf("GET", fas);
if (nu.success) {
  if (nu.result.rules?.some((r) => r.expression === regel.expression)) console.log("Regeln finns redan.");
  else {
    const r = await cf("POST", `/accounts/${KONTO}/rulesets/${nu.result.id}/rules`, regel);
    console.log(r.success ? "Regel tillagd." : "FEL regel: " + JSON.stringify(r.errors));
  }
} else {
  const r = await cf("PUT", fas, { rules: [regel] });
  console.log(r.success ? "Regel skapad." : "FEL regel: " + JSON.stringify(r.errors));
}
