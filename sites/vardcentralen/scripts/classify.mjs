// Regler för vilka 1177-enheter (vårdtyp "Vårdcentral") som räknas som vårdcentraler,
// vilken lokal benämning (typ) de har och vilken kedja/operatör som driver dem.

// Enheter som 1177 taggar som "Vårdcentral" men som är delfunktioner, inte vårdcentraler.
const EXCLUDE = [
  /fysioterapi/i, /sjukgymnast/i, /rehab/i, /samtalsmottagning/i, /familjecentral/i,
  /cellprovtagning/i, /^provtagning/i, /jourcentral/i, /kommunikationsavdelning/i, /vårdhotell/i,
  /digitala mottagning/i, /funktionsnedsättning/i, /äldrevårdcentral/i, /specialmottagning/i,
  /barnmorske/i, /ungdomsmottagning/i, /psykolog/i, /kurator/i, /dietist/i, /fotvård/i,
  /^barnavårdscentral/i, /^bvc\b/i, /^mvc\b/i, /vaccinationsmottagning/i, /^äldremottagning/i,
];
export function isExcluded(name) { return EXCLUDE.some((re) => re.test(name || '')); }

const NORRLAND_LAN = new Set(['22', '23', '24', '25']); // Västernorrland, Jämtland, Västerbotten, Norrbotten

// Lokal benämning. Ordningen spelar roll: filial/närmottagning går före namnets huvudord.
export function typFor(name, lanKod) {
  const n = name || '';
  if (/filial/i.test(n)) return 'filial';
  if (/närmottagning/i.test(n)) return 'närmottagning';
  if (/distriktssköterskemottagning/i.test(n)) return 'distriktssköterskemottagning';
  if (/sjukstuga/i.test(n)) return 'sjukstuga';
  if (/hälsocentral/i.test(n)) return 'hälsocentral';
  if (/husläkar/i.test(n)) return 'husläkarmottagning';
  if (/vårdcentral|vårdcentrum/i.test(n)) return 'vårdcentral';
  if (/läkarhus/i.test(n)) return 'läkarhus';
  if (/familjeläkar/i.test(n)) return 'familjeläkarmottagning';
  return NORRLAND_LAN.has(lanKod) ? 'hälsocentral' : 'vårdcentral';
}

// Kedjor/varumärken som syns i namn, vårdgivarnamn eller i 1177:s text om vem som driver enheten.
export const CHAINS = [
  [/\bcapio\b/i, 'Capio'], [/\bkry\b/i, 'Kry'], [/praktikertjänst/i, 'Praktikertjänst'], [/\baleris\b/i, 'Aleris'],
  [/doktor\.se/i, 'Doktor.se'], [/achima/i, 'Achima Care'], [/meliva/i, 'Meliva'], [/närhälsan/i, 'Närhälsan'],
  [/^bra liv\b|\bbra liv\b/i, 'Bra Liv'], [/din hälsocentral/i, 'Din hälsocentral'], [/familjeläkarna/i, 'Familjeläkarna'],
  [/premicare/i, 'Premicare'], [/omtanken/i, 'Omtanken'], [/medpro/i, 'Medpro Clinic'], [/\bhmc\b/i, 'HMC'],
  [/prima vård/i, 'Prima Vård'], [/bräcke diakoni/i, 'Bräcke diakoni'], [/nötkärnan/i, 'Nötkärnan'],
  [/tiohundra/i, 'Tiohundra'], [/wetterhälsan/i, 'Wetterhälsan'], [/sensia/i, 'Sensia'], [/legevisitten/i, 'Legevisitten'],
  [/hälsocentralen i/i, null], // generiskt – ingen kedja
];
export function chainFrom(...texts) {
  for (const t of texts) {
    if (!t) continue;
    for (const [re, name] of CHAINS) if (re.test(t)) return name;
  }
  return null;
}

// "Verksamheten drivs av Capio Läkarhus AB på uppdrag av Region Stockholm." -> "Capio Läkarhus AB"
export function operatorFromFinancingText(t) {
  if (!t) return null;
  const m = t.match(/drivs av ([^.,;]+?)(?: på uppdrag| i samarbete| med avtal| enligt|\.|,|;|$)/i);
  if (m) return m[1].trim();
  const m2 = t.match(/tillhör (Region [A-ZÅÄÖ][\wåäöÅÄÖ -]+?|[A-ZÅÄÖ][\wåäö]+ läns? landsting|Västra Götalandsregionen)(?:\.|,|$)/);
  return m2 ? m2[1].trim() : null;
}
