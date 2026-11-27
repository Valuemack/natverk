import { idagStockholm, iso } from "@natverk/core/datum.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { laddaKatalog } from "@natverk/core/katalog.js";
import { grindUnderlag, harEgenSida, kommunHarSida } from "./grind.js";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"loppis","plur":"loppisar","art":"en"};
export const SCHEMA_TYP = "Store";
export const TITEL_ORD = "öppettider";
export const KALLA = "Källor: välgörenhetsorganisationernas och kedjornas egna butiksuppgifter samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).";

const TYP = {"second hand":"Second hand-butik","kupan":"Kupan / Röda Korset second hand","loppis":"Loppis","återbruk":"Återbruk","second hand outlet":"Second hand-outlet","retro":"Retrobutik","antikvariat":"Antikvariat","loppmarknad":"Loppmarknad","vintage":"Vintagebutik","secondhand-varuhus":"Second hand-varuhus"};
const DATAFIL = resolve(process.cwd(), process.env.DATAFIL ?? "data/butiker.json");
const RA = existsSync(DATAFIL) ? JSON.parse(readFileSync(DATAFIL, "utf8")) : [];
// Webbfältet innehåller ibland bara ett namn (t.ex. en Facebook-sida utan adress). Det visas inte och räknas inte i grinden.
const rensaWebb = (e) => ({ ...e, webb: /^https?:\/\/[^\s/]+\.[^\s]+/i.test(e.webb ?? "") ? e.webb : null });
const UNDERLAG = grindUnderlag(RA.filter((e) => e.namn && e.kommun).map(rensaWebb));

export const KAT = laddaKatalog("data/butiker.json", {
  harEgenSida: (e) => harEgenSida(e, UNDERLAG),
  forbered: (r) => { const e = rensaWebb(r); return {
    ...e,
    typ: TYP[e.typ] ?? e.typ,
    listaRad: [TYP[e.typ] ?? e.typ, e.valgorenhet && "Välgörenhet", (e.sortiment ?? []).slice(0, 4).join(", ")].filter(Boolean).join(" · "),
    fakta: [
      e.valgorenhet && { namn: "Välgörenhet", varde: `Ja – överskottet går till ${e.organisation ?? e.kedja ?? "välgörande ändamål"}` },
      e.organisation && e.organisation !== e.kedja && !e.valgorenhet && { namn: "Organisation", varde: e.organisation },
      (e.sortiment ?? []).length > 0 && { namn: "Sortiment", varde: e.sortiment.map((x) => x[0].toUpperCase() + x.slice(1)).join(", ") },
      e.stadsdel && { namn: "Stadsdel", varde: e.stadsdel },
    ].filter(Boolean),
  }; },
});

// Kommuner som inte klarar grinden (src/grind.js) får ingen egen sida: deras butiker visas på länssidan,
// och alla länkar (kommunens och butikernas href) pekar dit. KAT.kommuner innehåller fortfarande alla kommuner
// (för grannkommuner och statistik); KAT.sidKommuner är de som har en sida.
for (const k of KAT.kommuner) {
  k.harSida = kommunHarSida(k);
  if (k.harSida) continue;
  const lan = KAT.lan.find((l) => l.slug === k.lanSlug);
  k.href = `${lan.href}#${k.slug}`;
  for (const e of k.enheter) e.href = `${lan.href}#${k.slug}-${e.slug}`;
}
for (const k of KAT.kommuner) for (const e of k.enheter) e.ankare = k.harSida ? e.slug : `${k.slug}-${e.slug}`;
KAT.sidKommuner = KAT.kommuner.filter((k) => k.harSida);

export const SITE = {
  tema: "loppis",
  tagline: "Loppis och second hand i hela Sverige",
  tjanstText: "Oberoende guide till loppisar och second hand · Uppdateras varje natt",
  kallor: ["Organisationernas butikssök (Röda Korset, Erikshjälpen, Myrorna, Stadsmissionen m.fl.)","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Loppisar",
  visningsnamn: "loppisar.nu",
  url: "https://loppisar.nu",
  beskrivning: "Alla loppisar, second hand-butiker och Kupan i Sverige med adress och öppettider – hitta loppis nära dig. Uppdateras varje natt.",
  organisation: "loppisar.nu",
  farg: "#9a4b14",
  meny: [{"namn":"Guider","href":"/guider/"},{"namn":"Välgörenhet","href":"/valgorenhet/"},{"namn":"Alla län","href":"/#lan"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om loppisar.nu", href: "/om/" },
    { namn: "Källor och metod", href: "/om/#kallor" },
    { namn: "Guider", href: "/guider/" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: välgörenhetsorganisationernas och kedjornas egna butiksuppgifter samt OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).",
  natverk: [],
};
