import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://lekplatserna.nu",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({ filter: (url) => !url.includes("/integritet/") })],
});
