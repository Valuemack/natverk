// Gemensam Claude-klient för skripten. Nyckeln läses från ANTHROPIC_API_KEY (natverk/.env lokalt,
// GitHub-secret i nattbygget) och skrivs aldrig ut.
import Anthropic from "@anthropic-ai/sdk";

// Modeller (kan bytas med miljövariabler utan kodändring).
export const MODELL_POANG = process.env.GODA_MODELL_POANG || "claude-haiku-5-5"; // billig: poängsättning
export const MODELL_TEXT = process.env.GODA_MODELL_TEXT || "claude-opus-5-5"; // bättre: text
export const MODELL_GRANSKA = process.env.GODA_MODELL_GRANSKA || "claude-opus-5-5"; // faktakontroll

// Listpriser i USD per miljon token (in, ut). Uppdatera om priserna ändras.
const PRIS = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

let klient = null;
export function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY saknas");
  klient ??= new Anthropic({ maxRetries: 3 });
  return klient;
}

export function kostnadAv(modell, usage) {
  const [pin, put] = PRIS[modell] ?? PRIS["claude-opus-5-5"];
  const inn = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) * 1.25 + (usage?.cache_read_input_tokens ?? 0) * 0.1;
  return (inn * pin + (usage?.output_tokens ?? 0) * put) / 1e6;
}

export const prisFor = (modell) => PRIS[modell] ?? PRIS["claude-opus-5-5"];

/**
 * Ett anrop med JSON-schema (structured outputs). Returnerar { data, usage, modell, kostnad }.
 * Opus-anropen har server-side fallback påslagen: om modellen avböjer av säkerhetsskäl
 * kör API:t samma fråga på en reservmodell i samma anrop.
 */
export async function jsonAnrop({ modell, system, text, innehall, schema, effort = "medium", maxTokens = 16000 }) {
  const c = claude();
  const params = {
    model: modell,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: innehall ?? text }], // innehall: färdiga innehållsblock (t.ex. bild + text)
    output_config: { effort, format: { type: "json_schema", schema } },
  };
  let svar;
  if (/opus|sonnet|fable/.test(modell)) {
    svar = await c.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } else {
    svar = await c.messages.create({ ...params, thinking: { type: "disabled" } });
  }
  if (svar.stop_reason === "refusal") throw new Error(`modellen avböjde (${svar.stop_details?.category ?? "okänd kategori"})`);
  if (svar.stop_reason === "max_tokens") throw new Error("svaret blev för långt (max_tokens)");
  const block = svar.content.find((b) => b.type === "text");
  if (!block) throw new Error("inget textsvar");
  return { data: JSON.parse(block.text), usage: svar.usage, modell: svar.model || modell, kostnad: kostnadAv(svar.model || modell, svar.usage) };
}
