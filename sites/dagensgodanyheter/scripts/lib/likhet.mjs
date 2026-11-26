// Hur lika två rubriker är (Jaccard på ord längre än tre tecken), 0–1. Används för att hitta samma nyhet från
// flera källor, t.ex. lärosätets pressmeddelande och samma text på forskning.se.
const ord = (t) => new Set(String(t).toLowerCase().replace(/[^a-zåäöéü0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
export function likhet(a, b) {
  const A = ord(a), B = ord(b);
  if (!A.size || !B.size) return 0;
  let gemensamma = 0;
  for (const w of A) if (B.has(w)) gemensamma++;
  return gemensamma / (A.size + B.size - gemensamma);
}
/** Gräns för "samma nyhet". 0,5 fångar omformulerade rubriker på samma pressmeddelande. */
export const SAMMA_NYHET = 0.5;
