// Låter testerna importera sajtens moduler, som importerar JSON utan import-attribut (Vite-stil).
export async function load(url, context, next) {
  if (url.endsWith(".json")) return next(url, { ...context, importAttributes: { type: "json" } });
  return next(url, context);
}
