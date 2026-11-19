// Visar DNSSEC-status (DS-post hos registret) för nätverkets 24 domäner.
import { domainToASCII } from "node:url";
import { HUVUD, OMDIR, dns } from "./domaner.mjs";
const alla = [...HUVUD.map((d) => d.namn), ...Object.keys(OMDIR)];
let pa = 0;
for (const n of alla) { const ds = await dns(domainToASCII(n), "DS"); if (ds.svar.length) pa++; console.log(n.padEnd(22), ds.svar.length ? "PÅ" : "av"); }
console.log(`\n${pa} av ${alla.length} har fortfarande DNSSEC`);
