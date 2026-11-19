import { idagStockholm, iso } from "@natverk/core/datum.js";
import { laddaKatalog, veckoSammanfattning } from "@natverk/core/katalog.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const IDAG = idagStockholm();
export const UPPDATERAD = iso(IDAG);

/** Ordformer som mallarna använder. art: "en" | "ett". */
export const ORD = {"sing":"bensinstation","plur":"bensinstationer","art":"en"};
export const SCHEMA_TYP = "GasStation";
export const TITEL_ORD = "öppettider och drivmedel";
export const KALLA = "Källor: bensinbolagens egna stationsuppgifter och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).";

/** Drivmedel i visningsordning: nyckel, kort namn, långt namn, slug för drivmedelssida (null = ingen egen sida). */
export const DRIVMEDEL = [
  ["bensin95", "95", "Bensin 95", null],
  ["bensin98", "98", "Bensin 98", null],
  ["diesel", "diesel", "Diesel", null],
  ["hvo100", "HVO100", "HVO100", "hvo100"],
  ["e85", "E85", "Etanol E85", "e85"],
  ["biogas", "fordonsgas", "Fordonsgas (biogas)", "fordonsgas"],
  ["el", "laddning", "Elbilsladdning", "laddning"],
  ["adblue", "AdBlue", "AdBlue", "adblue"],
  ["biodiesel", "biodiesel", "Biodiesel", null],
  ["b100", "B100", "B100", null],
  ["lng", "LNG", "Flytande gas (LNG)", null],
  ["lpg", "LPG", "Gasol för fordon (LPG)", null],
  ["vatgas", "vätgas", "Vätgas", "vatgas"],
  ["alkylat", "alkylat", "Alkylatbensin", null],
];
const TJANST = {
  butik: "Butik", mat: "Mat", kaffe_dryck: "Kaffe", toalett: "Toalett", skotbord: "Skötbord", biltvatt: "Biltvätt",
  dammsugare: "Dammsugare", luft_vatten: "Luft och vatten", gasol: "Gasol", slaputhyrning: "Släpvagnsuthyrning",
  biluthyrning: "Biluthyrning", receptfria_lakemedel: "Receptfria läkemedel", postombud: "Postombud", bankomat: "Bankomat",
  verkstad: "Verkstad", truckdiesel: "Lastbilsdiesel", lastbilsparkering: "Lastbilsparkering", laddning_lastbil: "Laddning för lastbil",
  dusch: "Dusch", sittplatser: "Sittplatser",
};
export const harDrivmedel = (e, nyckel) => e.extra?.drivmedel?.[nyckel] === true;
export const drivmedelFor = (e) => DRIVMEDEL.filter(([k]) => harDrivmedel(e, k));

// Kedjornas listpriser (företagspris inkl. moms). Gäller kedjan, inte enskild station.
export const LISTPRISER = JSON.parse(readFileSync(resolve(process.cwd(), "data/listpriser.json"), "utf8"));
export const listprisFor = (kedja) => LISTPRISER.kedjor.find((k) => k.kedja === kedja) ?? null;
export const kr = (v) => `${Number(v).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

// Samma bolag stavas olika i källorna.
const KEDJENAMN = { "fordonsgas sverige": "Fordonsgas", "fordonsgas": "Fordonsgas", "oljeshejkerna johnsson": "Oljeshejkerna" };
const kedjaNamn = (k) => (k ? KEDJENAMN[k.toLowerCase().replace(/\s+ab$/, "")] ?? k.replace(/\s+AB$/, "") : k);

// Vissa kedjor skriver adresser i versaler ("SMEDSMÄSTARG."). Ord på minst fyra versaler görs om till gemener (kortare är förkortningar som IDS, CNG) med stor begynnelsebokstav.
// JS-regexens \b fungerar inte med åäö, därför matchas ordgränsen explicit.
const versaler = (s) => (s ? s.replace(/(^|[\s,(\/-])([A-ZÅÄÖÉ]{4,})(?=[\s.,)\/-]|$)/g, (m, fore, w) => fore + w[0] + w.slice(1).toLowerCase()) : s);
const fixaNamn = versaler;

export const KAT = laddaKatalog("data/stationer.json", {
  harEgenSida: (e) => !!(e.gatuadress && (e.oppettider || !e.extra?.endast_osm || e.telefon)),
  forbered: (e) => {
    const x = e.extra ?? {};
    const kedja = kedjaNamn(e.kedja);
    const d = drivmedelFor(e);
    const tjanster = Object.entries(TJANST).filter(([k]) => x.tjanster?.[k] === true).map(([, v]) => v);
    const lp = listprisFor(kedja);
    const kundtjanst = !e.telefon && x.kundtjanst_telefon;
    const butikAnnan = x.oppettider_butik && e.oppettider && JSON.stringify(x.oppettider_butik) !== JSON.stringify(e.oppettider);
    return {
      ...e,
      namn: fixaNamn(e.namn),
      gatuadress: versaler(e.gatuadress),
      ort: e.ort && e.ort === e.ort.toUpperCase() ? e.ort[0] + e.ort.slice(1).toLowerCase() : e.ort,
      kedja,
      telefon: e.telefon ?? x.kundtjanst_telefon ?? null,
      telefon_typ: kundtjanst ? "kundservice" : e.telefon_typ,
      typ: e.typ === "obemannad" ? "obemannad station" : e.typ === "bemannad" ? "bemannad station" : e.typ === "truckstation" ? "truckstation" : null,
      listaRad: [kedja, d.filter(([k]) => !["bensin95", "bensin98", "diesel"].includes(k)).map(([, kort]) => kort).join(", "), x.tankning_dygnet_runt && "dygnet runt"].filter(Boolean).join(" · "),
      fakta: [
        d.length > 0 && { namn: "Drivmedel", varde: d.map(([, , lang]) => lang).join(", ") },
        x.tankning_dygnet_runt && { namn: "Tankning", varde: "Dygnet runt med kort" },
        tjanster.length > 0 && { namn: "Service", varde: tjanster.join(", ") },
        butikAnnan && { namn: "Butikens öppettider", varde: Object.values(x.oppettider_butik).every((v) => v === "00:00-24:00") ? "Dygnet runt" : veckoSammanfattning(x.oppettider_butik) ?? "Se stationens webbplats" },
        x.max_fordonslangd_m && { namn: "Max fordonslängd", varde: `${String(x.max_fordonslangd_m).replace(".", ",")} m` },
        x.f_d_shell && { namn: "Tidigare", varde: "Shell-station" },
        lp && { namn: `${kedja}s listpris idag`, varde: { __html: `${["bensin95", "diesel", "e85", "hvo100"].filter((k) => lp.priser?.[k] && harDrivmedel(e, k)).map((k) => `${DRIVMEDEL.find((y) => y[0] === k)[2]}: <strong>${kr(lp.priser[k].pris)}</strong>/l`).join("<br>")}<br><small>Kedjans listpris för företagskunder inkl. moms. Priset vid pumpen kan skilja sig.</small>` } },
      ].filter(Boolean),
    };
  },
});

export const SITE = {
  tema: "bensin",
  tagline: "Alla bensinstationer i Sverige",
  tjanstText: "Oberoende guide till tankställen · Uppdateras varje natt",
  kallor: ["Bensinbolagens stationssök","© OpenStreetMap-bidragsgivare (ODbL)"],
  namn: "Bensinstationer",
  visningsnamn: "bensinstationer.nu",
  url: "https://bensinstationer.nu",
  beskrivning: "Alla bensinstationer och tankställen i Sverige med adress, öppettider och drivmedel – hitta närmaste mack med diesel, E85, HVO100 eller laddning. Uppdateras varje natt.",
  organisation: "bensinstationer.nu",
  farg: "#1f4f8f",
  meny: [{"namn":"Bensinpris idag","href":"/bensinpris/"},{"namn":"Drivmedel","href":"/drivmedel/"},{"namn":"Kedjor","href":"/kedja/"},{"namn":"Om","href":"/om/"}],
  sidfot: [
    { namn: "Om bensinstationer.nu", href: "/om/" },
    { namn: "Källor", href: "/om/#kallor" },
    { namn: "Integritet och cookies", href: "/integritet/" },
  ],
  sidfotText: "Källor: bensinbolagens egna stationsuppgifter och OpenStreetMap (© OpenStreetMap-bidragsgivare, ODbL).",
  natverk: [],
};
