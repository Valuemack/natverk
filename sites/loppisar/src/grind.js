// Kvalitetsgrind för loppisar.nu (beslut 2026-11-27, se BYGGLOGG.md och SEO-playbook avsnitt 0).
//
// BUTIKSSIDA (/<kommun>/<butik>/) byggs bara när sidan har mer än butikens rad på kommunsidan:
//   1. kommunen har minst 3 butiker (annars visar kommunsidan varje butik i sin helhet, och en egen sida vore en dubblett),
//   2. verkliga ordinarie öppettider från en källa (minst en dag med öppet, inte bara "stängt"/okänt),
//   3. gatuadress, och
//   4. minst två av: eget telefonnummer, egen butikssida hos organisationen (en URL som bara den butiken har)
//      och ett sortiment med minst tre varugrupper.
// KOMMUNSIDA (/<kommun>/) byggs när kommunen har minst 3 butiker, eller minst en butik med både öppettider och adress
// (då kan sidan svara fullt ut på "loppis i <kommun>"). Övriga kommuner visas på länssidan.
// Allt som inte får en egen sida finns kvar som rad/kort på närmaste förälder, och den gamla URL:en 301-omdirigeras dit.
import { harOppettider } from "@natverk/core/katalog.js";

export const MIN_BUTIKER_KOMMUN = 3;

export const riktigaTider = (e) => harOppettider(e) && Object.values(e.oppettider).some((v) => v && !/^stängt$/i.test(v));
export const fullstandig = (e) => riktigaTider(e) && !!e.gatuadress;

/** Underlag som grinden behöver om hela datamängden: antal butiker per kommun och per webbadress. */
export function grindUnderlag(enheter) {
  const perKommun = new Map(), perWebb = new Map();
  for (const e of enheter) {
    perKommun.set(e.kommun, (perKommun.get(e.kommun) ?? 0) + 1);
    if (e.webb) perWebb.set(e.webb, (perWebb.get(e.webb) ?? 0) + 1);
  }
  return { perKommun, perWebb };
}

export const egenWebb = (e, u) => !!e.webb && u.perWebb.get(e.webb) === 1;
export const extraUppgifter = (e, u) => (!!e.telefon) + egenWebb(e, u) + ((e.sortiment ?? []).length >= 3);

export function harEgenSida(e, u) {
  if ((u.perKommun.get(e.kommun) ?? 0) < MIN_BUTIKER_KOMMUN) return false;
  if (!fullstandig(e)) return false;
  return extraUppgifter(e, u) >= 2;
}

/** k.enheter = alla butiker i kommunen. */
export const kommunHarSida = (k) => k.enheter.length >= MIN_BUTIKER_KOMMUN || k.enheter.some(fullstandig);
