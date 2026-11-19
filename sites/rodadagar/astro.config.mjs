import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://xn--rdadagar-n4a.nu",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    // lastmod sätts efter bygget av packages/core/scripts/indexnow.mjs (verklig ändringsdag per sida).
    sitemap({ filter: (url) => !url.includes("/integritet/") }),
  ],
});
