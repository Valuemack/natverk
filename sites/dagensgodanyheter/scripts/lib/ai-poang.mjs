// Poängsättning med den billiga modellen (Claude Haiku 5.5): 20 kandidater per anrop.
import { jsonAnrop, MODELL_POANG } from "./claude.mjs";
import { KATEGORIER } from "../../src/lib/kategorier.js";

const SYSTEM = `Du bedömer nyhetskandidater för en svensk sajt med enbart positiva och hoppfulla nyheter.
Varje kandidat är rubrik och sammanfattning från en förstahandskälla (myndighet, lärosäte, forskningsinstitut, internationell organisation).
Bedöm varje kandidat:
- positiv (0–10): hur tydligt positiv eller hoppfull nyheten är i sak. Ett framsteg, en lösning, en återhämtning, en upptäckt eller en förbättring ger högt. Neutral administration ger 3–5. Allt som handlar om död, våld, katastrofer, kriser, varningar eller förluster ger 0–2, även om det finns en ljusglimt.
- betydelse (0–10): hur många som berörs och hur stor förändringen är. Lokala småsaker ger lågt, nationella eller globala framsteg ger högt.
- lamplig (true/false): false om nyheten är reklam för en produkt, en tävling, en evenemangsinbjudan, en personalnyhet, en ren statistikpublicering utan förändring, partipolitik, ett investeringstips eller om den kräver medicinska råd för att bli begriplig. false också om den handlar om enskilda privatpersoner.
  Jubileer, firanden, ceremonier, prisutdelningar, studentnyheter, praktikplatser, kursutbud, rekryteringar och samarbetsavtal utan konkret resultat ger betydelse högst 3.
  Lokala nyheter från ett annat land (en kommun, ett enskilt lärosätes interna program) ger betydelse högst 3.
- kategori: en av ${KATEGORIER.map((k) => k.slug).join(", ")}. "inrikes" bara för svenska samhällsnyheter som inte passar bättre i ett ämne. "utrikes" för internationella samhällsnyheter.
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
        required: ["nr", "positiv", "betydelse", "lamplig", "kategori", "skal"],
        properties: {
          nr: { type: "integer" },
          positiv: { type: "integer" },
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
    const text = del.map((c, j) => `#${j + 1} [källa: ${c.kallnamn}]\nRubrik: ${c.titel}\nSammanfattning: ${c.sammanfattning.slice(0, 500) || "(saknas)"}`).join("\n\n");
    const svar = await jsonAnrop({ modell: MODELL_POANG, system: SYSTEM, text, schema: SCHEMA, effort: "low", maxTokens: 4000 });
    kostnad += svar.kostnad;
    for (const b of svar.data.bedomningar ?? []) {
      const c = del[b.nr - 1];
      if (c) bedomda.set(c.id, { ...b, positiv: klamp(b.positiv), betydelse: klamp(b.betydelse) });
    }
  }
  return { bedomda, kostnad };
}
