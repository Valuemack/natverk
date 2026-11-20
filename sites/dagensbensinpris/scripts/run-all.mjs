// Datahämtning för dagensbensinpris.se. Ett steg som misslyckas stoppar inte de andra;
// då byggs sajten från förra datan (incheckad i repot).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENSIN = path.resolve(ROT, "../bensinstationer");
const kor = (namn, fil, cwd) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [fil], { cwd, stdio: "inherit" });
  console.log(`== ${namn}: ${r.status === 0 ? "OK" : "FEL"} på ${Math.round((Date.now() - t0) / 1000)} s\n`);
  return r.status === 0;
};

// 1. Kedjornas listpriser (samma hämtare som bensinstationer.nu) -> kopia hit.
if (kor("listpriser", "scripts/fetch-priser.mjs", BENSIN)) fs.copyFileSync(path.join(BENSIN, "data/listpriser.json"), path.join(ROT, "data/listpriser.json"));
// 2. EU:s veckopriser och historik.
kor("EU Weekly Oil Bulletin", "scripts/fetch-eu.mjs", ROT);
// 3. Daglig historik.
kor("daglig historik", "scripts/historik.mjs", ROT);
