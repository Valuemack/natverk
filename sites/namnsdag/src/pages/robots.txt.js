import { robotsTxt } from "@natverk/core/seo.js";
import { SITE } from "../site.js";

export function GET() {
  return new Response(robotsTxt(SITE), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
