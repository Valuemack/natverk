// Chain detection, typ and sortiment classification shared by fetch-osm.mjs and merge.mjs.

// Order matters: first match wins. `re` is tested against "name brand operator" (lowercased).
export const CHAINS = [
  { kedja: 'Myrorna', re: /myrorna/, valgorenhet: true },
  { kedja: 'Erikshjälpen Second Hand', re: /erikshj[äa]lpen/, valgorenhet: true },
  { kedja: 'Röda Korset', re: /r[öo]da\s*korset|(?<![a-zåäö])kupan(?![a-zåäö])|red cross/, valgorenhet: true },
  { kedja: 'Stadsmissionen', re: /stadsmission/, valgorenhet: true },
  { kedja: 'PMU Second Hand', re: /(?<![a-zåäö])pmu(?![a-zåäö])/, valgorenhet: true },
  { kedja: 'Hela Människan', re: /hela\s*m[äa]nniskan/, valgorenhet: true },
  { kedja: 'Lindra Second Hand', re: /lindra|human\s*bridge|l[äa]karmissionen/, valgorenhet: true },
  { kedja: 'Emmaus', re: /emmaus|artikel\s*2|bj[öo]rk[åa]\s*frihet/, valgorenhet: true },
  { kedja: 'Rädda Barnen', re: /r[äa]dda\s*barnen/, valgorenhet: true },
  { kedja: 'Frälsningsarmén', re: /fr[äa]lsningsarm[ée]n/, valgorenhet: true },
  { kedja: 'Hoppets Stjärna', re: /hoppets\s*stj[äa]rna/, valgorenhet: true },
  { kedja: 'Läkare i Världen', re: /l[äa]kare i v[äa]rlden/, valgorenhet: true },
  { kedja: 'Sackeus', re: /sackeus/, valgorenhet: true },
];

/** Return { kedja, valgorenhet } or null. `chainHint` = kedja from a chain source (wins). */
export function detectChain(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  for (const c of CHAINS) if (c.re.test(t)) return { kedja: c.kedja, valgorenhet: !!c.valgorenhet };
  return null;
}

/** Canonical chain name for chain-source kedja strings (e.g. "PMU Second Hand" stays, "Röda Korset Second Hand" -> "Röda Korset"). */
export function canonicalChain(kedja) {
  if (!kedja) return null;
  return detectChain(kedja)?.kedja ?? kedja;
}

export function typFrom({ name = '', shop, amenity, chainTyp, kedja } = {}) {
  const n = name.toLowerCase();
  if (chainTyp && chainTyp !== 'second hand') return chainTyp;
  if (amenity === 'marketplace' || /loppmarknad|loppistorg/.test(n)) return 'loppmarknad';
  if (/(?<![a-zåäö])kupan/.test(n)) return 'kupan';
  if (/loppis|lopis/.test(n)) return 'loppis';
  if (/antikvariat/.test(n) || shop === 'books') return 'antikvariat';
  if (/vintage/.test(n) && !kedja) return 'vintage';
  if (/(?<![a-zåäö])retro/.test(n) && !kedja) return 'retro';
  if (/återbruk|returbutik|retur(?:en|huset)|återvinning/.test(n)) return 'återbruk';
  return 'second hand';
}

const SORT_FROM_SHOP = {
  clothes: ['kläder'], books: ['böcker'], furniture: ['möbler'], shoes: ['skor'], baby_goods: ['barnartiklar'],
  toys: ['leksaker'], houseware: ['husgeråd'], interior_decoration: ['inredning'], antiques: ['antikt', 'inredning'],
  music: ['media'], bicycle: ['cyklar'], sports: ['sport'], outdoor: ['sport'], art: ['konst'], collector: ['samlarobjekt'],
  fashion_accessories: ['accessoarer'], bag: ['accessoarer'], jewelry: ['accessoarer'], electronics: ['elektronik'],
  hifi: ['elektronik'], video_games: ['media'], frame: ['konst'], lamps: ['inredning'],
};
const SORT_FROM_NAME = [
  ['kläder', /kläd|mode(?![a-zåäö])|fashion|klädes/],
  ['barnartiklar', /barn(?:loppis|kläder|saker)|kids|barnens/],
  ['möbler', /möbel|möbler|furniture/],
  ['böcker', /bok(?:hand|loppis|en)?(?![a-zåäö])|böcker|antikvariat/],
  ['media', /vinyl|skiv|record/],
  ['cyklar', /cykel/],
];

/** Sortiment from OSM tags + name. */
export function sortimentFromOsm(tags) {
  const out = new Set();
  const shop = tags.shop;
  if (shop && SORT_FROM_SHOP[shop]) SORT_FROM_SHOP[shop].forEach(s => out.add(s));
  // second_hand=* is a yes/only flag; some mappers list goods in e.g. "clothes=*", "books=*"
  if (tags.clothes) out.add('kläder');
  if (tags.books) out.add('böcker');
  if (tags.furniture) out.add('möbler');
  const n = (tags.name || '').toLowerCase();
  for (const [s, re] of SORT_FROM_NAME) if (re.test(n)) out.add(s);
  return [...out];
}

// ---------------------------------------------------------------- OSM inclusion rules
export const SH_NAME = /loppis|lopis|loppmarknad|second\s*-?\s*hand|secondhand|2nd\s*hand|(?<![a-zåäö])kupan(?![a-zåäö])|myrorna|erikshj[äa]lpen|stadsmission|emmaus|returbutik|återbruk|artikel\s*2|bj[öo]rk[åa]\s*frihet|antikvariat|skivbörs/i;
// shops where second_hand=only (sells only used goods) qualifies
const ONLY_SHOPS = new Set(['clothes', 'books', 'furniture', 'antiques', 'variety_store', 'general', 'interior_decoration', 'houseware',
  'toys', 'baby_goods', 'shoes', 'bag', 'music', 'sports', 'outdoor', 'gift', 'fashion_accessories', 'frame', 'art', 'collector',
  'craft', 'fabric', 'department_store', 'boutique', 'fashion', 'lamps', 'kitchen', 'doityourself', 'yes']);
// shops where second_hand=yes (also sells used goods) is enough on its own
const YES_SHOPS = new Set(['variety_store', 'general', 'antiques', 'yes', 'flea_market']);
const NOT_SHOPS = new Set(['car', 'car_parts', 'car_repair', 'motorcycle', 'tyres', 'boat', 'trade', 'mobile_phone', 'computer', 'electronics',
  'video_games', 'caravan', 'agrarian', 'truck', 'fuel', 'supermarket', 'convenience', 'pawnbroker', 'vacant']);

/** 'shop' | 'market' | null - whether an OSM feature is a second hand shop / loppis. */
export function osmKind(t) {
  if (!t) return null;
  if (t.disused === 'yes' || t.abandoned === 'yes' || /^(closed|off)$/i.test(t.opening_hours || '')) return null;
  const shop = t.shop, name = t.name || '', sh = t.second_hand || '';
  if (sh === 'no') return null; // e.g. fair-trade shops tagged shop=charity
  if (shop === 'second_hand' || shop === 'charity' || shop === 'flea_market') return 'shop';
  if (shop && NOT_SHOPS.has(shop)) return null;
  if (shop && sh === 'only' && ONLY_SHOPS.has(shop)) return 'shop';
  if (shop && sh === 'yes' && YES_SHOPS.has(shop)) return 'shop';
  if (shop && SH_NAME.test(name)) return 'shop';
  if (t.amenity === 'marketplace' && /loppis|loppmarknad|second\s*hand|flea/i.test(name)) return 'market';
  return null;
}
