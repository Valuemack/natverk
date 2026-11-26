import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://dagensgodanyheter.se",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    // lastmod sätts efter bygget av packages/core/scripts/indexnow.mjs (verklig ändringsdag per sida).
    // Nyhetssitemapen (senaste 48 timmarna) är en egen fil: /nyhetssitemap.xml.
    sitemap({ filter: (url) => !url.includes("/integritet/") }),
  ],
});
