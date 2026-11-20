// Datahämtning för jourapotek.se: uppdaterar apotekslistan via apoteken.nus pipeline och sparar helgtider.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const kor = (skript, cwd) => {
  console.log(`\n=== ${skript}`);
  const r = spawnSync(process.execPath, [skript], { cwd: resolve(cwd), stdio: "inherit" });
  if (r.status !== 0) console.error(`${skript} misslyckades (${r.status}) – fortsätter med befintlig data`);
};
kor("scripts/run-all.mjs", "../apoteken");
kor("scripts/historik.mjs", ".");
