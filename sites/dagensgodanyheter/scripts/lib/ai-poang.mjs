// Poängsättning med den billiga modellen (Claude Haiku 5.5): 20 kandidater per anrop.
import { jsonAnrop, MODELL_POANG } from "./claude.mjs";
import { KATEGORIER } from "../../src/lib/kategorier.js";
import { TYPER } from "../../src/lib/vikter.js";

const SYSTEM = `Du bedömer nyhetskandidater för en svensk sajt med enbart positiva och hoppfulla nyheter.
Varje kandidat är rubrik och sammanfattning från en förstahandskälla (myndighet, lärosäte, forskningsinstitut, internationell organisation).
Bedöm varje kandidat:
- positiv (0–10): hur tydligt positiv eller hoppfull nyheten är i sak. Ett framsteg, en lösning, en återhämtning, en upptäckt eller en förbättring ger högt. Neutral administration ger 3–5. Allt som handlar om död, våld, katastrofer, kriser, varningar eller förluster ger 0–2, även om det finns en ljusglimt.
- gladje (0–10), det viktigaste måttet: hur glad blir en vanlig läsare av nyheten? Fråga dig: skulle man berätta det här vid middagsbordet och känna "wow, världen är en vacker plats"? 9–10: djur och natur som kommer tillbaka, människor som gör något extremt fint för andra eller för naturen, sjukdomar som trängs tillbaka, ett tydligt rekord i ren energi, en hisnande upptäckt i rymden, något charmigt eller roligt. 6–8: ett konkret framsteg som många märker. 3–5: nyttigt men torrt. 0–2: byråkrati, administration och sånt som ingen berättar vidare. Bedöm sakinnehållet, inte hur säljande rubriken är.
  Kalibrering: tiotusentals färre arbetslösa, en sjukdom som nästan försvunnit eller ideella insatser värda miljarder ger 8–9. En eldsjäl som i 40 år ringmärkt fåglar ger 7–8. Färsk mat som odlas åt astronauter eller ett rekordlångt rymdfynd ger 7–8. Ett lån eller bidrag till ett enskilt företag eller projekt, en utbildning av tjänstemän, en ny teknisk metod som bara experter förstår eller en liten trafiksäkerhetsåtgärd ger 2–4.
- typ: en av natur (natur och djur som kommer tillbaka), manniskor (människor som gör fina saker: volontärer, räddare, givare, barn och unga), medicin (medicinska genombrott), klimat (klimat och energi som blir bättre), rymden (rymden och vetenskap som får en att säga wow), siffror (statistik som visar att något blir bättre), charm (charmiga eller roliga nyheter), ovrigt.
- byrakratisk (true/false): true för upphandlingar, namnbyten, jubileer och årsdagar, tal och anföranden, konferenser och möten, standarder och riktlinjer, beredskap, remisser, organisationsförändringar och interna pris-, utbildnings- eller personalnyheter. Sådana nyheter gör ingen glad; ge dem gladje högst 2.
- betydelse (0–10): hur många som berörs och hur stor förändringen är. Lokala småsaker ger lågt, nationella eller globala framsteg ger högt.
- lamplig (true/false): false om nyheten är reklam för en produkt, en tävling, en evenemangsinbjudan, en personalnyhet, en ren statistikpublicering utan förändring, partipolitik, ett investeringstips eller om den kräver medicinska råd för att bli begriplig. false också om den handlar om enskilda privatpersoner.
  Jubileer, firanden, ceremonier, prisutdelningar, studentnyheter, praktikplatser, kursutbud, rekryteringar och samarbetsavtal utan konkret resultat ger betydelse högst 3.
  Lokala nyheter från ett annat land (en kommun, ett enskilt lärosätes interna program) ger betydelse högst 3.
- kategori: en av ${KATEGORIER.map((k) => k.slug).join(", ")}. "inrikes" bara för svenska samhällsnyheter som inte passar bättre i ett ämne. "utrikes" för internationella samhällsnyheter.
- trend: om kandidaten har en rad "Möjliga trendämnen": skriv det trendämne (exakt som det står, utan parentesen) som nyheten verkligen handlar om – samma sak, person, organisation, plats eller händelse, inte bara ett gemensamt ord. Annars en tom sträng.
- skal: högst 15 ord om varför.
Var sträng: hellre lågt än för högt.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bedomningar"],
  properties: {
    bedomningar: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nr", "positiv", "gladje", "typ", "byrakratisk", "betydelse", "lamplig", "kategori", "trend", "skal"],
        properties: {
          nr: { type: "integer" },
          positiv: { type: "integer" },
          gladje: { type: "integer" },
          typ: { type: "string", enum: Object.keys(TYPER) },
          byrakratisk: { type: "boolean" },
          trend: { type: "string" },
          betydelse: { type: "integer" },
          lamplig: { type: "boolean" },
          kategori: { type: "string", enum: KATEGORIER.map((k) => k.slug) },
          skal: { type: "string" },
        },
      },
    },
  },
};

const klamp = (x) => Math.max(0, Math.min(10, Math.round(Number(x) || 0)));

export async function bedomKandidater(kandidater) {
  const bedomda = new Map();
  let kostnad = 0;
  for (let i = 0; i < kandidater.length; i += 20) {
    const del = kandidater.slice(i, i + 20);
    const text = del.map((c, j) => `#${j + 1} [källa: ${c.kallnamn}]\nRubrik: ${c.titel}\nSammanfattning: ${c.sammanfattning.slice(0, 500) || "(saknas)"}${c.mojligaTrender?.length ? `\nMöjliga trendämnen: ${c.mojligaTrender.map((t, i) => (c.trendAmne?.[i] && c.trendAmne[i].toLowerCase() !== t.toLowerCase() ? `${t} (handlar om: ${c.trendAmne[i]})` : t)).join(" | ")}` : ""}`).join("\n\n");
    const svar = await jsonAnrop({ modell: MODELL_POANG, system: SYSTEM, text, schema: SCHEMA, effort: "medium", maxTokens: 8000 });
    kostnad += svar.kostnad;
    for (const b of svar.data.bedomningar ?? []) {
      const c = del[b.nr - 1];
      if (!c) continue;
      const trend = (c.mojligaTrender ?? []).find((t) => t.toLowerCase() === String(b.trend ?? "").trim().toLowerCase()) ?? null;
      bedomda.set(c.id, { ...b, positiv: klamp(b.positiv), gladje: b.byrakratisk ? Math.min(2, klamp(b.gladje)) : klamp(b.gladje), betydelse: klamp(b.betydelse), trend });
    }
  }
  return { bedomda, kostnad };
}
