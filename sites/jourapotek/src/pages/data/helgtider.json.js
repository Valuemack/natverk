// Sparade helgtider per datum och apotek. Byggskriptet hämtar den publicerade filen och fyller på varje natt.
import { HELGTIDER } from "../../site.js";
export const GET = () => new Response(JSON.stringify(HELGTIDER), { headers: { "Content-Type": "application/json" } });
