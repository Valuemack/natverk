import { narmasteJson } from "@natverk/core/katalog.js";
import { KAT } from "../site.js";
import { VERKTYG } from "../verktyg.js";

export const GET = () => new Response(narmasteJson(KAT, VERKTYG), { headers: { "Content-Type": "application/json" } });
