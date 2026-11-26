// Nätverkets domäner. Huvuddomän → Pages-projekt, och omdirigeringsdomän → mål.
import { domainToASCII } from "node:url";

export const HUVUD = [
  ["loppisar.nu", "loppisar"], ["rödadagar.nu", "rodadagar"], ["vårdcentralen.nu", "vardcentralen"], ["apoteken.nu", "apoteken"],
  ["förskolor.nu", "forskolor"], ["komvux.nu", "komvux"], ["biblioteken.nu", "biblioteken"], ["bensinstationer.nu", "bensinstationer"],
  ["parkeringar.nu", "parkeringar"], ["pollenläget.se", "pollenlaget"], ["badstränder.se", "badstrander"], ["simhallar.se", "simhallar"],
  ["lekplatserna.nu", "lekplatserna"],
  ["dagensbensinpris.se", "dagensbensinpris"], ["jourapotek.se", "jourapotek"],
  ["dagensgodanyheter.se", "dagensgodanyheter"], ["namnsdagsidag.se", "namnsdag"],
].map(([namn, projekt]) => ({ namn, ascii: domainToASCII(namn), projekt }));

// DNS-uppslag via Cloudflares offentliga DNS-over-HTTPS (inga nycklar).
export async function dns(namn, typ) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(namn)}&type=${typ}`, { headers: { accept: "application/dns-json" } });
  const j = await r.json();
  return { status: j.Status, svar: (j.Answer ?? []).filter((a) => a.type === { A: 1, NS: 2, MX: 15, TXT: 16, DS: 43, AAAA: 28 }[typ]).map((a) => a.data) };
}

// Omdirigeringsdomäner → mål (301, sökvägen behålls).
// Bara åäö-varianterna ska vara omdirigeringar på sikt; övriga byggs ut till egna sajter och flyttas då till HUVUD.
export const OMDIR = {
  "forskolor.nu": "https://xn--frskolor-n4a.nu",
  "badstrander.se": "https://xn--badstrnder-v5a.se",
  "pollenlaget.se": "https://xn--pollenlget-w5a.se",
  "apotekinfo.se": "https://apoteken.nu",
  "klämdagar.se": "https://xn--rdadagar-n4a.nu/klamdagar/",
  "folkbibliotek.se": "https://biblioteken.nu",
  "gratisparkeringar.se": "https://parkeringar.nu/gratis-parkering/",
  "lovdagar.se": "https://xn--rdadagar-n4a.nu",
  "secondhandbutiker.se": "https://loppisar.nu",
};
