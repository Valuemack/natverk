import { narmasteJson } from "@natverk/core/katalog.js";
import { KAT } from "../site.js";

export const GET = () => new Response(narmasteJson(KAT), { headers: { "Content-Type": "application/json" } });
