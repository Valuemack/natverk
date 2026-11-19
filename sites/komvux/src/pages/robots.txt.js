import { robotsTxt } from "@natverk/core/seo.js";
import { SITE } from "../site.js";

export const GET = () => new Response(robotsTxt(SITE), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
