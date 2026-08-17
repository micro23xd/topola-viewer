/**
 * The words for a relationship, in both languages.
 *
 * Same arrangement as `evidence_labels.ts`, and for the same reason: the chart
 * renderer is built by the topola library and never sees a react-intl provider,
 * so both sides read one pair of tables rather than keeping two vocabularies.
 *
 * One convention has to be fixed and then held to, because German and English
 * count great-grandparents differently in ordinary speech. Here **the number in
 * `n×Urgroßvater` is the number of `Ur` prefixes**: three generations up is
 * `Urgroßvater`, four is `Ururgroßvater`, eleven is `9×Urgroßvater`. Since that
 * is exactly the point where a reader starts counting on their fingers, the
 * panel prints the generation count beside it and never asks anyone to trust
 * the arithmetic.
 */

import {Kind, Kinship} from './kinship';

export type Sex = 'M' | 'F' | undefined;

export interface KinshipLabels {
  /** The tab, and the heading inside it. */
  header: string;
  personA: string;
  personB: string;
  pick: string;
  clear: string;
  swap: string;
  /** Nobody picked yet. */
  empty: string;
  same: string;
  none: string;
  /** The relationship of A to B, as a noun. */
  term(kinship: Kinship, sexOfA: Sex): string;
  /** The verdict as a sentence. */
  sentence(nameA: string, term: string, nameB: string): string;
  /** The one line the Info tab prints under a name. */
  relationTo(
    term: string,
    homeName: string,
    lines: number,
    blood: boolean,
  ): string;
  /** "6 und 6 Generationen" — the two distances, said plainly. */
  generationsPair(upA: number, upB: number): string;
  /** Where the two lines reach the shared ancestor through two marriages. */
  throughMarriages: string;
  generations(n: number): string;
  /** "über 11 Linien" — only worth saying above one. */
  linesOfDescent(n: number): string;
  /** The shared couple, or the single shared ancestor. */
  throughCouple: string;
  throughOne: string;
  halfNote: string;
  marriedToo: string;
  adopted: string;
  chainA: string;
  chainB: string;
  further(mrcas: number, lines: number): string;
  /** "11 von 12 Ehen auf dieser Linie sind urkundlich belegt." */
  documented(steps: number, uncited: number, weakest?: number): string;
  bridge: {parent: string; child: string; spouse: string};
  bridgeHeader: string;
  offNetwork: string;
  reroot: string;
  partial: string;
  unknownName: string;
}

/** father → grandfather → great-grandfather → … */
function ascend(
  up: number,
  base: [string, string, string],
  great: [string, string, string],
  prefix: (n: number, word: string) => string,
  sex: Sex,
): string {
  const pick = (words: [string, string, string]) =>
    sex === 'M' ? words[0] : sex === 'F' ? words[1] : words[2];
  if (up <= 1) return pick(base);
  if (up === 2) return pick(great);
  return prefix(up - 2, pick(great));
}

const DE_ORDINAL = (n: number) => `${n}.`;

function deTerm(k: Kinship, sex: Sex): string {
  const {kind, degree, removal, half} = k;
  const male = sex === 'M';
  const female = sex === 'F';
  const either = (m: string, f: string, n: string) =>
    male ? m : female ? f : n;
  // The adjective has to agree with the noun it is put in front of.
  const halb = female ? 'halbbürtige ' : 'halbbürtiger ';
  // One `Ur` per generation above `Großvater`, spelled out twice and counted
  // after that — `Ururgroßvater` is still read at a glance, `Urururur…` is not.
  const ur = (n: number, word: string) => {
    const stem = word.toLowerCase();
    if (n === 1) return `Ur${stem}`;
    if (n === 2) return `Urur${stem}`;
    return `${n}×Ur${stem}`;
  };

  switch (kind) {
    case 'same':
      return 'dieselbe Person';
    case 'ancestor':
      return ascend(
        removal,
        ['Vater', 'Mutter', 'Elternteil'],
        ['Großvater', 'Großmutter', 'Großelternteil'],
        ur,
        sex,
      );
    case 'descendant':
      return ascend(
        removal,
        ['Sohn', 'Tochter', 'Kind'],
        ['Enkel', 'Enkelin', 'Enkelkind'],
        ur,
        sex,
      );
    case 'sibling':
      return half
        ? either('Halbbruder', 'Halbschwester', 'Halbgeschwister')
        : either('Bruder', 'Schwester', 'Geschwister');
    case 'avuncular': {
      const word = ascend(
        removal,
        ['Onkel', 'Tante', 'Onkel/Tante'],
        ['Großonkel', 'Großtante', 'Großonkel/-tante'],
        ur,
        sex,
      );
      return half ? `${halb}${word}` : word;
    }
    case 'nibling': {
      const word = ascend(
        removal,
        ['Neffe', 'Nichte', 'Neffe/Nichte'],
        ['Großneffe', 'Großnichte', 'Großneffe/-nichte'],
        ur,
        sex,
      );
      return half ? `${halb}${word}` : word;
    }
    case 'cousin': {
      const word = either('Cousin', 'Cousine', 'Cousin/Cousine');
      const grade = `${word} ${DE_ORDINAL(degree - 1)} Grades`;
      const removed = removal ? `, ${removal}× entfernt` : '';
      return `${half ? halb : ''}${grade}${removed}`;
    }
    case 'affinal':
      return 'verschwägert';
    case 'chain':
      return 'nur über Heiraten verbunden';
    case 'none':
      return 'nicht verbunden';
  }
}

const EN_ORDINALS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

function enOrdinal(n: number): string {
  if (n < EN_ORDINALS.length) return EN_ORDINALS[n];
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

function enRemoved(n: number): string {
  if (!n) return '';
  if (n === 1) return ', once removed';
  if (n === 2) return ', twice removed';
  return `, ${n} times removed`;
}

function enTerm(k: Kinship, sex: Sex): string {
  const {kind, degree, removal, half} = k;
  const either = (m: string, f: string, n: string) =>
    sex === 'M' ? m : sex === 'F' ? f : n;
  // `great-grandfather`, `great-great-grandfather`, then counted.
  const great = (n: number, word: string) =>
    n === 1
      ? `great-${word}`
      : n === 2
        ? `great-great-${word}`
        : `${n}× great-${word}`;
  // The uncle and nephew words already carry one `great` at two generations.
  const greater = (n: number, word: string) =>
    n === 1 ? `great-${word}` : `${n + 1}× ${word}`;

  switch (kind) {
    case 'same':
      return 'the same person';
    case 'ancestor':
      return ascend(
        removal,
        ['father', 'mother', 'parent'],
        ['grandfather', 'grandmother', 'grandparent'],
        great,
        sex,
      );
    case 'descendant':
      return ascend(
        removal,
        ['son', 'daughter', 'child'],
        ['grandson', 'granddaughter', 'grandchild'],
        great,
        sex,
      );
    case 'sibling':
      return `${half ? 'half-' : ''}${either('brother', 'sister', 'sibling')}`;
    case 'avuncular':
      return `${half ? 'half-' : ''}${ascend(
        removal,
        ['uncle', 'aunt', 'uncle or aunt'],
        ['great-uncle', 'great-aunt', 'great-uncle or -aunt'],
        greater,
        sex,
      )}`;
    case 'nibling':
      return `${half ? 'half-' : ''}${ascend(
        removal,
        ['nephew', 'niece', 'nephew or niece'],
        ['great-nephew', 'great-niece', 'great-nephew or -niece'],
        greater,
        sex,
      )}`;
    case 'cousin':
      return `${half ? 'half ' : ''}${enOrdinal(degree - 1)} cousin${enRemoved(
        removal,
      )}`;
    case 'affinal':
      return 'related by marriage';
    case 'chain':
      return 'connected only through marriages';
    case 'none':
      return 'not connected';
  }
}

const DE: KinshipLabels = {
  header: 'Verwandtschaft',
  personA: 'Ausgewählt',
  personB: 'Verglichen mit',
  pick: 'Person suchen',
  clear: 'Auswahl aufheben',
  swap: 'Tauschen',
  empty:
    'Wählen Sie eine zweite Person, um zu sehen, wie die beiden verwandt sind.',
  same: 'Dieselbe Person.',
  none: 'Der Baum erfasst keine Verbindung zwischen diesen beiden.',
  term: (kinship, sex) => deTerm(kinship, sex),
  sentence: (nameA, term, nameB) => `${nameA} ist ${term} von ${nameB}.`,
  relationTo: (term, homeName, lines, blood) =>
    blood
      ? `${term} von ${homeName}${lines > 1 ? `, über ${lines} Linien` : ''}`
      : `mit ${homeName} ${term}`,
  generationsPair: (upA, upB) => `${upA} und ${upB} Generationen`,
  throughMarriages: 'über zwei Ehen',
  generations: (n) => (n === 1 ? '1 Generation' : `${n} Generationen`),
  linesOfDescent: (n) => (n === 1 ? 'über 1 Linie' : `über ${n} Linien`),
  throughCouple: 'über das Paar',
  throughOne: 'über',
  halfNote: 'Halbbürtig: die beiden Linien laufen über zwei verschiedene Ehen.',
  marriedToo: 'Die beiden sind außerdem miteinander verheiratet.',
  adopted: 'angenommen',
  chainA: 'Von der ausgewählten Person aufwärts',
  chainB: 'Von der verglichenen Person aufwärts',
  further: (mrcas, lines) =>
    `${mrcas} weitere${mrcas === 1 ? 'r' : ''} gemeinsame${
      mrcas === 1 ? 'r' : ''
    } Vorfahr${mrcas === 1 ? '' : 'en'}, ${lines} Linien insgesamt`,
  documented: (steps, uncited, weakest) => {
    if (!steps) return '';
    const good = steps - uncited;
    const head =
      uncited === 0
        ? `Alle ${steps} Ehen auf dieser Linie sind belegt`
        : `${good} von ${steps} Ehen auf dieser Linie sind belegt`;
    const tier =
      weakest !== undefined && weakest <= 1
        ? `, die schwächste nur als Hinweis (QUAY ${weakest})`
        : '';
    return `${head}${tier}.`;
  },
  bridge: {parent: 'Elternteil', child: 'Kind', spouse: 'Ehepartner'},
  bridgeHeader: 'Der Weg durch den Baum',
  offNetwork:
    'Das Ahnennetz zeigt nur die Vorfahren der Wurzelperson, und diese Linie liegt nicht ganz darin.',
  reroot: 'Ahnennetz auf den gemeinsamen Vorfahren stellen',
  partial:
    'Die Suche wurde abgebrochen — was hier steht ist eine Untergrenze, nicht die ganze Antwort.',
  unknownName: 'N. N.',
};

const EN: KinshipLabels = {
  header: 'Relationship',
  personA: 'Selected',
  personB: 'Compared with',
  pick: 'Search for a person',
  clear: 'Clear',
  swap: 'Swap',
  empty: 'Pick a second person to see how the two are related.',
  same: 'The same person.',
  none: 'The file records no connection between these two.',
  term: (kinship, sex) => enTerm(kinship, sex),
  sentence: (nameA, term, nameB) => `${nameA} is ${nameB}’s ${term}.`,
  relationTo: (term, homeName, lines, blood) =>
    blood
      ? `${homeName}’s ${term}${lines > 1 ? `, through ${lines} lines` : ''}`
      : `${term} to ${homeName}`,
  generationsPair: (upA, upB) => `${upA} and ${upB} generations`,
  throughMarriages: 'through two marriages',
  generations: (n) => (n === 1 ? '1 generation' : `${n} generations`),
  linesOfDescent: (n) => (n === 1 ? 'through 1 line' : `through ${n} lines`),
  throughCouple: 'through the couple',
  throughOne: 'through',
  halfNote: 'Half: the two lines run through two different marriages.',
  marriedToo: 'The two are also married to each other.',
  adopted: 'adopted',
  chainA: 'Up from the selected person',
  chainB: 'Up from the compared person',
  further: (mrcas, lines) =>
    `${mrcas} further common ancestor${
      mrcas === 1 ? '' : 's'
    }, ${lines} line${lines === 1 ? '' : 's'} in all`,
  documented: (steps, uncited, weakest) => {
    if (!steps) return '';
    const good = steps - uncited;
    const head =
      uncited === 0
        ? `All ${steps} marriages on this line are documented`
        : `${good} of ${steps} marriages on this line are documented`;
    const tier =
      weakest !== undefined && weakest <= 1
        ? `, the weakest as a lead only (QUAY ${weakest})`
        : '';
    return `${head}${tier}.`;
  },
  bridge: {parent: 'parent', child: 'child', spouse: 'spouse'},
  bridgeHeader: 'The way through the file',
  offNetwork:
    'The ancestor network holds only the root person’s ancestors, and this line is not entirely on it.',
  reroot: 'Show the network from the common ancestor',
  partial:
    'The search was cut short — what is shown is a floor, not the whole answer.',
  unknownName: 'N. N.',
};

/** The labels for a locale string such as `de-DE`; English for anything else. */
export function kinshipLabels(locale?: string): KinshipLabels {
  return locale?.toLowerCase().startsWith('de') ? DE : EN;
}

/** How A relates to B, as a noun phrase. */
export function describeKinship(
  kinship: Kinship,
  sexOf: (id: string) => Sex,
  labels: KinshipLabels,
): string {
  return labels.term(kinship, sexOf(kinship.a));
}

/** Which of `kind` needs no shared ancestor to be named. */
export function isBloodKind(kind: Kind): boolean {
  return (
    kind === 'ancestor' ||
    kind === 'descendant' ||
    kind === 'sibling' ||
    kind === 'avuncular' ||
    kind === 'nibling' ||
    kind === 'cousin'
  );
}
