// Builds data/kommuner.json: all 290 kommuner { kommunkod, namn, lan, lanskod, slug }.
// Primary source: SCB PxWeb region list (official kommun + län names, CC0).
// Cross-check: Skolverket Skolenhetsregistret v1 /kommun.
import { cachedJson, writeJson, slugify } from './lib.mjs';

console.log('01 kommuner');
const scb = await cachedJson(
  'scb_regioner.json',
  'https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy',
);
const reg = scb.variables.find((v) => v.code === 'Region');
const lan = new Map();
const kommuner = [];
reg.values.forEach((code, i) => {
  const text = reg.valueTexts[i].trim();
  if (/^\d{2}$/.test(code) && code !== '00') lan.set(code, text);
  if (/^\d{4}$/.test(code)) kommuner.push({ kommunkod: code, namn: text });
});

const skv = await cachedJson('skolverket_kommuner.json', 'https://api.skolverket.se/skolenhetsregistret/v1/kommun');
const skvMap = new Map(skv.Kommuner.map((k) => [k.Kommunkod, k.Namn]));

const problems = [];
for (const k of kommuner) {
  if (!skvMap.has(k.kommunkod)) problems.push(`${k.kommunkod} ${k.namn} saknas hos Skolverket`);
  else if (skvMap.get(k.kommunkod) !== k.namn) problems.push(`${k.kommunkod}: SCB "${k.namn}" vs Skolverket "${skvMap.get(k.kommunkod)}"`);
}
for (const [kod, namn] of skvMap) if (!kommuner.find((k) => k.kommunkod === kod)) problems.push(`${kod} ${namn} saknas hos SCB`);
if (problems.length) console.warn('  kontroll:', problems);
if (kommuner.length !== 290) throw new Error(`Expected 290 kommuner, got ${kommuner.length}`);
if (lan.size !== 21) throw new Error(`Expected 21 län, got ${lan.size}`);

const out = kommuner
  .map((k) => {
    const lanskod = k.kommunkod.slice(0, 2);
    if (!lan.has(lanskod)) throw new Error('Unknown län ' + lanskod);
    return { kommunkod: k.kommunkod, namn: k.namn, lan: lan.get(lanskod), lanskod, slug: slugify(k.namn) };
  })
  .sort((a, b) => a.kommunkod.localeCompare(b.kommunkod));

// Resolve slug collisions (Håbo/Habo -> both "habo"): the name without å/ä/ö keeps the
// plain slug, the other gets its län appended ("habo-uppsala"). Deterministic.
const bySlug = new Map();
for (const k of out) bySlug.set(k.slug, [...(bySlug.get(k.slug) || []), k]);
for (const group of bySlug.values()) {
  if (group.length < 2) continue;
  for (const k of group) {
    if (/[åäö]/i.test(k.namn)) k.slug = `${k.slug}-${slugify(k.lan.replace(/s? län$/, ''))}`;
  }
  console.log('  slug-kollision löst:', group.map((k) => `${k.namn} -> ${k.slug}`).join(', '));
}
const slugs = new Set(out.map((k) => k.slug));
if (slugs.size !== out.length) throw new Error('Duplicate kommun slugs');
writeJson('kommuner.json', out);
