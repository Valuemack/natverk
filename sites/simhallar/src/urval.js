// Urvalssidor (äventyrsbad, 50-metersbassänger). Egen fil eftersom getStaticPaths inte når komponentens konstanter.
import { harFacilitet } from "./site.js";

export const URVAL = {
  aventyrsbad: {
    namn: "Äventyrsbad",
    titel: (n) => `Äventyrsbad i Sverige – ${n} bad med rutschkana`,
    h1: "Äventyrsbad och bad med rutschkana",
    filter: (e) => e.typ === "äventyrsbad" || harFacilitet(e, "rutschkana") || harFacilitet(e, "aventyrsbad"),
    intro: (n, l) => `${n} bad i ${l} län är äventyrsbad eller har rutschkana.`,
    fraga: "Vad är ett äventyrsbad?",
    svar: "Ett äventyrsbad är en badanläggning med fokus på lek, till exempel rutschkanor, vågmaskin, strömkanal och varma bassänger. Många har också relaxavdelning med bastu.",
  },
  "50-meter": {
    namn: "50-metersbassänger",
    titel: (n) => `50-metersbassäng – ${n} simhallar med långbana`,
    h1: "Simhallar med 50-metersbassäng",
    filter: (e) => (e.extra?.bassanger ?? []).some((b) => b.langd_m === 50 || /50\s*-?\s*m/i.test(b.namn ?? "")),
    intro: (n, l) => `${n} simhallar i ${l} län har en 50-metersbassäng (långbana) enligt våra uppgifter.`,
    fraga: "Vad är skillnaden mellan kortbana och långbana?",
    svar: "Kortbana är en 25-metersbassäng och långbana en 50-metersbassäng. Tävlingar på långbana räknas separat, och många motionssimmare föredrar långbanan för att slippa vändningar.",
  },
};
