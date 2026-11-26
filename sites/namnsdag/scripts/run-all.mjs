// Hämtar all data för namnsdagssajten. Namnlängden ändras sällan (några namn vart 3–5 år) och
// SCB-tabellerna uppdateras inte längre, så skriptet behöver bara köras när källorna ändras –
// nattbygget kan bygga direkt från de sparade filerna i data/.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
for (const s of ["01-namnlangd.mjs", "02-scb.mjs", "03-scb-topplistor.mjs"]) {
  console.log(`\n== ${s}`);
  execFileSync(process.execPath, [join(dir, s)], { stdio: "inherit" });
}
