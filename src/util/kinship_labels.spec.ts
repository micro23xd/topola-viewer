import {describe, expect, it} from '@jest/globals';
import {Kind, Kinship} from './kinship';
import {kinshipLabels, Sex} from './kinship_labels';

/** Only the four fields a term is built from matter here. */
function shape(
  kind: Kind,
  degree: number,
  removal: number,
  half = false,
): Kinship {
  return {
    a: 'A',
    b: 'B',
    kind,
    degree,
    removal,
    half,
    married: false,
    others: [],
    mrcas: 0,
    lines: 0,
    uncited: 0,
    steps: 0,
    partial: false,
  };
}

const de = kinshipLabels('de-DE');
const en = kinshipLabels('en');

type Row = [Kind, number, number, boolean, Sex, string, string];

const TABLE: Row[] = [
  ['ancestor', 0, 1, false, 'M', 'Vater', 'father'],
  ['ancestor', 0, 2, false, 'F', 'Großmutter', 'grandmother'],
  ['ancestor', 0, 3, false, 'M', 'Urgroßvater', 'great-grandfather'],
  ['ancestor', 0, 4, false, 'M', 'Ururgroßvater', 'great-great-grandfather'],
  ['ancestor', 0, 11, false, 'M', '9×Urgroßvater', '9× great-grandfather'],
  ['ancestor', 0, 2, false, undefined, 'Großelternteil', 'grandparent'],
  ['descendant', 0, 1, false, 'F', 'Tochter', 'daughter'],
  ['descendant', 0, 3, false, 'F', 'Urenkelin', 'great-granddaughter'],
  ['sibling', 1, 0, false, 'M', 'Bruder', 'brother'],
  ['sibling', 1, 0, true, 'M', 'Halbbruder', 'half-brother'],
  ['sibling', 1, 0, false, undefined, 'Geschwister', 'sibling'],
  ['avuncular', 1, 1, false, 'F', 'Tante', 'aunt'],
  ['avuncular', 1, 2, false, 'M', 'Großonkel', 'great-uncle'],
  ['avuncular', 1, 3, false, 'M', 'Urgroßonkel', 'great-great-uncle'],
  ['nibling', 1, 2, false, 'M', 'Großneffe', 'great-nephew'],
  ['cousin', 2, 0, false, 'M', 'Cousin 1. Grades', 'first cousin'],
  [
    'cousin',
    6,
    0,
    true,
    'M',
    'halbbürtiger Cousin 5. Grades',
    'half fifth cousin',
  ],
  [
    'cousin',
    2,
    0,
    true,
    'F',
    'halbbürtige Cousine 1. Grades',
    'half first cousin',
  ],
  ['avuncular', 1, 1, true, 'F', 'halbbürtige Tante', 'half-aunt'],
  [
    'cousin',
    4,
    2,
    false,
    'F',
    'Cousine 3. Grades, 2× entfernt',
    'third cousin, twice removed',
  ],
  [
    'cousin',
    3,
    1,
    false,
    undefined,
    'Cousin/Cousine 2. Grades, 1× entfernt',
    'second cousin, once removed',
  ],
];

describe('kinship terms', () => {
  TABLE.forEach(([kind, degree, removal, half, sex, german, english]) => {
    it(`${kind} ${degree}/${removal}${half ? ' half' : ''} → ${german}`, () => {
      const k = shape(kind, degree, removal, half);
      expect(de.term(k, sex)).toBe(german);
      expect(en.term(k, sex)).toBe(english);
    });
  });

  it('falls back to English for a locale it has no table for', () => {
    expect(kinshipLabels('fr-FR').header).toBe(kinshipLabels(undefined).header);
    expect(kinshipLabels('de').header).toBe('Verwandtschaft');
  });
});

describe('the sentences around the term', () => {
  it('says how many marriages on the line are documented', () => {
    expect(de.documented(12, 1, 3)).toBe(
      '11 von 12 Ehen auf dieser Linie sind belegt.',
    );
    expect(de.documented(4, 0, 1)).toBe(
      'Alle 4 Ehen auf dieser Linie sind belegt, die schwächste nur als Hinweis (QUAY 1).',
    );
    expect(en.documented(4, 0, 3)).toBe(
      'All 4 marriages on this line are documented.',
    );
  });

  it('counts lines of descent and further ancestors', () => {
    expect(de.linesOfDescent(11)).toBe('über 11 Linien');
    expect(de.further(8, 9)).toBe(
      '8 weitere gemeinsame Vorfahren, 9 Linien insgesamt',
    );
    expect(en.further(1, 1)).toBe('1 further common ancestor, 1 line in all');
  });
});
