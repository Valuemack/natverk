// Poängsättning av kandidater: hur positiv, hur betydelsefull, hur färsk och hur pålitlig källan är.
// Heuristiken används alltid; när ANTHROPIC_API_KEY finns ersätts positiv/betydelse av en billig modells bedömning.

const POSITIVA = [
  // svenska
  "genombrott", "framsteg", "rekord", "lyckats", "lyckas", "räddad", "räddat", "räddar", "återvänder", "återhämtar", "återhämtning", "ökar andelen",
  "minskat utsläpp", "minskade utsläpp", "minskar utsläpp", "ny behandling", "nytt läkemedel", "botas", "framgång", "första", "prisas", "belönas",
  "tilldelas", "invigs", "invigning", "öppnar", "skyddas", "skyddat", "naturreservat", "nationalpark", "förbättrad", "förbättras", "förbättring", "lovande",
  "hopp", "hoppfull", "upptäckt", "upptäcker", "hittat", "fynd", "ökad överlevnad", "fler överlever", "renare", "förnybar", "solenergi", "vindkraft",
  "fossilfri", "cirkulär", "återbruk", "nyfödda", "ungar", "kläckts", "föds", "bevarande", "stärker", "satsning", "satsar", "stöd till", "minskar risken",
  "lägre risk", "friskare", "glädje", "samarbete", "unik", "historisk", "milstolpe", "lanserar", "utvecklat", "ny metod", "ny teknik",
  // engelska
  "breakthrough", "record", "success", "successful", "milestone", "first", "discover", "discovered", "discovery", "recover", "recovery", "restored",
  "restoration", "protected", "protect", "saved", "save", "rescue", "improve", "improved", "boost", "cure", "vaccine", "treatment", "hope", "promising",
  "award", "prize", "renewable", "clean energy", "solar", "wind power", "rebound", "thriving", "returns", "comeback", "launch", "new species", "hatch",
  "born", "eradicat", "eliminat", "lower risk", "reduce", "reduced", "decline in deaths", "fewer deaths", "achieve", "celebrat", "innovat", "partnership",
];
const NEGATIVA = [
  // svenska
  "död", "döda", "dödade", "dödsfall", "omkom", "mord", "skjut", "kniv", "våld", "krig", "attack", "terror", "bomb", "explosion", "brand", "olycka",
  "kris", "varning", "varnar", "larm", "hot", "hotar", "hotad", "rasar", "kollaps", "konkurs", "varsel", "uppsägning", "bedrägeri", "brott", "fängelse",
  "smitta", "utbrott", "epidemi", "pandemi", "svält", "torka", "översvämning", "storm", "katastrof", "skandal", "misstänkt", "åtal", "förlust",
  "minskar kraftigt", "allvarlig", "oro", "rädsla", "farlig", "giftig", "förorening", "ökad dödlighet", "fler dör", "inställd", "stängs", "nedläggning",
  // engelska
  "death", "dead", "killed", "kill", "murder", "shooting", "war", "attack", "terror", "bomb", "explosion", "fire", "crash", "crisis", "warning",
  "warns", "threat", "collapse", "bankrupt", "layoff", "fraud", "crime", "prison", "outbreak", "epidemic", "pandemic", "famine", "drought", "flood",
  "storm", "disaster", "scandal", "suspect", "lawsuit", "conflict", "violence", "refugee crisis", "humanitarian crisis", "casualties", "displaced",
  "emergency", "deadly", "toxic", "pollution", "decline", "loss", "worst", "fear", "risk of", "shortage", "starvation", "hunger", "cholera", "mpox",
];
const BETYDELSE = [
  "första i världen", "världens första", "first ever", "world's first", "för första gången", "for the first time", "miljoner", "million", "miljard",
  "billion", "global", "världen", "worldwide", "nationell", "hela landet", "procent", "percent", "studie", "study", "published", "publicerad",
  "nature", "science", "lancet", "nejm", "regeringen", "beslut", "who", "nobel", "rekord", "record", "genombrott", "breakthrough",
];

// Ordet måste börja vid en ordgräns ("dom" ska inte träffa "kingdom"), men får ha ändelser ("dödade").
const REGEX = new Map();
const re = (o) => REGEX.get(o) ?? REGEX.set(o, new RegExp(`(^|[^a-zåäöéü])${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).get(o);
const traffar = (text, lista) => lista.reduce((n, o) => n + (re(o).test(text) ? 1 : 0), 0);

export function heuristik(kandidat, kalla, nu = Date.now()) {
  const text = `${kandidat.titel} ${kandidat.titel} ${kandidat.sammanfattning}`.toLowerCase(); // titeln väger dubbelt
  const titel = kandidat.titel.toLowerCase();
  const pos = traffar(text, POSITIVA);
  const neg = traffar(text, NEGATIVA) + traffar(titel, NEGATIVA); // negativt i rubriken väger extra
  const positiv = Math.max(0, Math.min(1, 0.45 + 0.1 * pos - 0.14 * neg));
  const betydelse = Math.max(0, Math.min(1, 0.3 + 0.08 * traffar(text, BETYDELSE) + (kalla.typ === "myndighet" || kalla.typ === "rymd" ? 0.1 : 0)));
  const farskhet = farskhetAv(kandidat.datum, nu);
  const tillit = kalla.tillit ?? 0.8;
  return { positiv: rund(positiv), betydelse: rund(betydelse), farskhet: rund(farskhet), tillit, metod: "heuristik" };
}

/** Halveringstid 36 timmar. Saknat datum räknas som ganska gammalt. */
export function farskhetAv(datum, nu = Date.now()) {
  if (!datum) return 0.25;
  const timmar = Math.max(0, (nu - new Date(datum).getTime()) / 3.6e6);
  return Math.pow(0.5, timmar / 36);
}

/** Totalpoäng 0–100 för en kandidat. */
export function total(p) {
  return Math.round(100 * (0.35 * p.positiv + 0.25 * p.betydelse + 0.2 * p.farskhet + 0.2 * p.tillit));
}

const rund = (x) => Math.round(x * 100) / 100;
