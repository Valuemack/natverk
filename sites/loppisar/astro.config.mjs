import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Skriver dist/_redirects (äkta 301 för borttagna sidor) efter varje bygge – även nattbyggets "npx astro build".
const omdirigeringar = {
  name: "loppisar-omdirigeringar",
  hooks: { "astro:build:done": async () => (await import("./scripts/omdirigeringar.mjs")).skrivOmdirigeringar() },
};

export default defineConfig({
  site: "https://loppisar.nu",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({ filter: (url) => !url.includes("/integritet/") }), omdirigeringar],
});
