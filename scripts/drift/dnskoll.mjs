// Visar namnservrar, DNSSEC (DS-post), e-post (MX) och webbadress (A) för nätverkets domäner.
import { HUVUD, dns } from "./domaner.mjs";
for (const d of HUVUD) {
  const [ns, ds, mx, a] = await Promise.all(["NS", "DS", "MX", "A"].map((t) => dns(d.ascii, t)));
  console.log(`${d.namn.padEnd(20)} status=${ns.status} NS=${ns.svar.join(",") || "-"} | DNSSEC=${ds.svar.length ? "PÅ" : "av"} | MX=${mx.svar.join(",") || "-"} | A=${a.svar.join(",") || "-"}`);
}
