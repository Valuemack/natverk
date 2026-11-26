import { robotsTxt } from "@natverk/core/seo.js";
import { SITE } from "../site.js";

// Nätverkets gemensamma regler plus nyhetssitemapen.
export const GET = () => new Response(`${robotsTxt(SITE)}Sitemap: ${SITE.url}/nyhetssitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
