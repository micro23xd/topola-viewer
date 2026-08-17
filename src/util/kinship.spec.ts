import {describe, expect, it} from '@jest/globals';
import {parse as parseGedcom} from 'parse-gedcom';
import {GedcomData, prepareGedcom} from './gedcom_util';
import {ancestorPaths, kinship} from './kinship';

interface Person {
  id: string;
  sex?: 'M' | 'F';
  famc?: string[];
  fams?: string[];
}

interface Family {
  id: string;
  husb?: string;
  wife?: string;
  chil?: Array<string | [string, 'adopted']>;
  /** QUAY on the marriage, when the fixture cares about the evidence. */
  quay?: number;
}

/** A GEDCOM built from the shape a test is about, rather than a wall of text. */
function build(people: Person[], families: Family[]): GedcomData {
  const lines = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1'];
  people.forEach((person) => {
    lines.push(`0 @${person.id}@ INDI`);
    lines.push(`1 NAME ${person.id} /Test/`);
    if (person.sex) lines.push(`1 SEX ${person.sex}`);
    (person.famc ?? []).forEach((fam) => lines.push(`1 FAMC @${fam}@`));
    (person.fams ?? []).forEach((fam) => lines.push(`1 FAMS @${fam}@`));
  });
  families.forEach((fam) => {
    lines.push(`0 @${fam.id}@ FAM`);
    if (fam.husb) lines.push(`1 HUSB @${fam.husb}@`);
    if (fam.wife) lines.push(`1 WIFE @${fam.wife}@`);
    (fam.chil ?? []).forEach((child) => {
      if (Array.isArray(child)) {
        lines.push(`1 CHIL @${child[0]}@`);
        lines.push(`2 PEDI ${child[1]}`);
      } else {
        lines.push(`1 CHIL @${child}@`);
      }
    });
    if (fam.quay !== undefined) {
      lines.push('1 MARR');
      lines.push('2 SOUR @S1@');
      lines.push(`3 QUAY ${fam.quay}`);
    }
  });
  lines.push('0 @S1@ SOUR', '1 TITL Kirchenbuch', '0 TRLR', '');
  return prepareGedcom(parseGedcom(lines.join('\n')));
}

/**
 * Three generations with a side branch:
 *
 *   GF ⚭ GM  →  FATHER, UNCLE
 *   FATHER ⚭ MOTHER → CHILD
 *   UNCLE ⚭ AUNT → COUSIN
 */
const THREE = build(
  [
    {id: 'GF', sex: 'M', fams: ['F1']},
    {id: 'GM', sex: 'F', fams: ['F1']},
    {id: 'FATHER', sex: 'M', famc: ['F1'], fams: ['F2']},
    {id: 'MOTHER', sex: 'F', fams: ['F2']},
    {id: 'UNCLE', sex: 'M', famc: ['F1'], fams: ['F3']},
    {id: 'AUNT', sex: 'F', fams: ['F3']},
    {id: 'CHILD', sex: 'M', famc: ['F2']},
    {id: 'COUSIN', sex: 'F', famc: ['F3']},
  ],
  [
    {id: 'F1', husb: 'GF', wife: 'GM', chil: ['FATHER', 'UNCLE'], quay: 3},
    {id: 'F2', husb: 'FATHER', wife: 'MOTHER', chil: ['CHILD'], quay: 3},
    {id: 'F3', husb: 'UNCLE', wife: 'AUNT', chil: ['COUSIN'], quay: 1},
  ],
);

describe('kinship', () => {
  it('reads a direct line in both directions', () => {
    const down = kinship(THREE, 'GF', 'CHILD');
    expect(down.kind).toBe('ancestor');
    expect(down.degree).toBe(0);
    expect(down.removal).toBe(2);
    expect(down.mrcas).toBe(1);
    expect(down.lines).toBe(1);
    expect(down.best?.id).toBe('GF');

    const up = kinship(THREE, 'CHILD', 'GF');
    expect(up.kind).toBe('descendant');
    expect(up.removal).toBe(2);
    expect(up.best?.fromA.steps.map((step) => step.id)).toEqual([
      'FATHER',
      'GF',
    ]);
  });

  it('calls a person their own', () => {
    expect(kinship(THREE, 'CHILD', 'CHILD').kind).toBe('same');
  });

  it('names siblings, and does not call them half', () => {
    const k = kinship(THREE, 'FATHER', 'UNCLE');
    expect(k.kind).toBe('sibling');
    expect(k.degree).toBe(1);
    expect(k.removal).toBe(0);
    expect(k.half).toBe(false);
    expect(k.best?.throughFam).toBe('F1');
    expect(k.best?.partner).toBe('GM');
    // Both grandparents are most recent common ancestors.
    expect(k.mrcas).toBe(2);
  });

  it('names an uncle and a nephew from the same pair', () => {
    expect(kinship(THREE, 'FATHER', 'COUSIN').kind).toBe('avuncular');
    expect(kinship(THREE, 'COUSIN', 'FATHER').kind).toBe('nibling');
    expect(kinship(THREE, 'FATHER', 'COUSIN').removal).toBe(1);
  });

  it('names first cousins', () => {
    const k = kinship(THREE, 'CHILD', 'COUSIN');
    expect(k.kind).toBe('cousin');
    expect(k.degree).toBe(2);
    expect(k.removal).toBe(0);
    expect(k.half).toBe(false);
  });

  it('counts the marriages on the line and the ones with no citation', () => {
    const k = kinship(THREE, 'CHILD', 'COUSIN');
    // F2 and F1 on one side, F3 and F1 on the other.
    expect(k.steps).toBe(4);
    expect(k.uncited).toBe(0);
    expect(k.weakest).toBe(1);

    const bare = kinship(THREE, 'CHILD', 'GF');
    expect(bare.steps).toBe(2);
  });

  it('sees a spouse who married in as related by marriage only', () => {
    const k = kinship(THREE, 'MOTHER', 'GF');
    expect(k.kind).toBe('affinal');
    expect(k.bridge?.map((hop) => [hop.via, hop.id])).toEqual([
      ['spouse', 'FATHER'],
      ['parent', 'GF'],
    ]);
  });

  it('says nothing rather than guessing when the file records no link', () => {
    const apart = build(
      [
        {id: 'A', sex: 'M'},
        {id: 'B', sex: 'F'},
      ],
      [],
    );
    const k = kinship(apart, 'A', 'B');
    expect(k.kind).toBe('none');
    expect(k.mrcas).toBe(0);
    expect(k.bridge).toBeUndefined();
  });
});

describe('half relationships', () => {
  /** One man, two marriages, one line of descent from each. */
  const TWO_MARRIAGES = build(
    [
      {id: 'MAN', sex: 'M', fams: ['FA', 'FB']},
      {id: 'WIFE1', sex: 'F', fams: ['FA']},
      {id: 'WIFE2', sex: 'F', fams: ['FB']},
      {id: 'A1', sex: 'M', famc: ['FA'], fams: ['FA2']},
      {id: 'B1', sex: 'M', famc: ['FB'], fams: ['FB2']},
      {id: 'A2', sex: 'M', famc: ['FA2'], fams: ['FA3']},
      {id: 'B2', sex: 'F', famc: ['FB2'], fams: ['FB3']},
      {id: 'A3', sex: 'M', famc: ['FA3']},
      {id: 'B3', sex: 'F', famc: ['FB3']},
    ],
    [
      {id: 'FA', husb: 'MAN', wife: 'WIFE1', chil: ['A1'], quay: 3},
      {id: 'FB', husb: 'MAN', wife: 'WIFE2', chil: ['B1'], quay: 3},
      {id: 'FA2', husb: 'A1', chil: ['A2'], quay: 3},
      {id: 'FB2', husb: 'B1', chil: ['B2'], quay: 3},
      {id: 'FA3', husb: 'A2', chil: ['A3'], quay: 3},
      {id: 'FB3', wife: 'B2', chil: ['B3'], quay: 3},
    ],
  );

  it('calls half-siblings half, and names the one shared parent', () => {
    const k = kinship(TWO_MARRIAGES, 'A1', 'B1');
    expect(k.kind).toBe('sibling');
    expect(k.half).toBe(true);
    expect(k.best?.id).toBe('MAN');
    expect(k.best?.throughFam).toBeUndefined();
    expect(k.mrcas).toBe(1);
  });

  it('carries half down the generations', () => {
    const k = kinship(TWO_MARRIAGES, 'A3', 'B3');
    expect(k.kind).toBe('cousin');
    // Three generations up on both sides: half second cousins.
    expect(k.degree).toBe(3);
    expect(k.half).toBe(true);
    expect(k.best?.id).toBe('MAN');
    // The two lines reach him through two different marriages, which is what
    // "half" means and why the panel names both.
    expect(k.best?.fromA.steps[2].famId).toBe('FA');
    expect(k.best?.fromB.steps[2].famId).toBe('FB');
  });
});

describe('a web rather than a chain', () => {
  /**
   * Two brothers' grandchildren marry, so their child descends from the
   * founding couple twice.
   */
  const COLLAPSE = build(
    [
      {id: 'P', sex: 'M', fams: ['F0']},
      {id: 'Q', sex: 'F', fams: ['F0']},
      {id: 'S1', sex: 'M', famc: ['F0'], fams: ['F1']},
      {id: 'S2', sex: 'M', famc: ['F0'], fams: ['F2']},
      {id: 'D1', sex: 'M', famc: ['F1'], fams: ['F3']},
      {id: 'D2', sex: 'F', famc: ['F2'], fams: ['F3']},
      {id: 'K', sex: 'M', famc: ['F3']},
    ],
    [
      {id: 'F0', husb: 'P', wife: 'Q', chil: ['S1', 'S2'], quay: 3},
      {id: 'F1', husb: 'S1', chil: ['D1'], quay: 3},
      {id: 'F2', husb: 'S2', chil: ['D2'], quay: 3},
      {id: 'F3', husb: 'D1', wife: 'D2', chil: ['K'], quay: 3},
    ],
  );

  it('counts every line of descent to a repeated ancestor', () => {
    const k = kinship(COLLAPSE, 'K', 'P');
    expect(k.kind).toBe('descendant');
    expect(k.removal).toBe(3);
    expect(k.mrcas).toBe(1);
    expect(k.lines).toBe(2);
    expect(ancestorPaths(COLLAPSE, 'K').get('P')?.length).toBe(2);
  });

  it('reports the parents of a consanguineous couple as their own kin', () => {
    const k = kinship(COLLAPSE, 'D1', 'D2');
    expect(k.kind).toBe('cousin');
    expect(k.degree).toBe(2);
    expect(k.married).toBe(true);
  });
});

describe('what the file says about a link', () => {
  const ADOPTION = build(
    [
      {id: 'MUM', sex: 'F', fams: ['FX']},
      {id: 'STEP', sex: 'M', fams: ['FX']},
      {id: 'SON', sex: 'M', famc: ['FX']},
    ],
    [{id: 'FX', husb: 'STEP', wife: 'MUM', chil: [['SON', 'adopted']]}],
  );

  it('marks an adopted step instead of dropping or hiding it', () => {
    const k = kinship(ADOPTION, 'SON', 'STEP');
    expect(k.kind).toBe('descendant');
    expect(k.best?.adopted).toBe(true);
    expect(k.best?.fromA.steps[0].adopted).toBe(true);
  });

  it('counts a family with no marriage citation rather than scoring it', () => {
    const k = kinship(ADOPTION, 'SON', 'MUM');
    expect(k.steps).toBe(1);
    expect(k.uncited).toBe(1);
    expect(k.weakest).toBeUndefined();
  });
});

describe('guards', () => {
  it('terminates on a file that makes someone their own ancestor', () => {
    // A cycle is a defect rather than a shape, so the only thing promised here
    // is that the walk stops and refuses to name a common ancestor.
    const CYCLE = build(
      [
        {id: 'X', sex: 'M', famc: ['FB'], fams: ['FA']},
        {id: 'Y', sex: 'M', famc: ['FA'], fams: ['FB']},
      ],
      [
        {id: 'FA', husb: 'X', chil: ['Y']},
        {id: 'FB', husb: 'Y', chil: ['X']},
      ],
    );
    const paths = ancestorPaths(CYCLE, 'X');
    expect(Array.from(paths.keys()).sort()).toEqual(['X', 'Y']);
    const k = kinship(CYCLE, 'X', 'Y');
    expect(k.mrcas).toBe(0);
    expect(k.kind).toBe('chain');
  });

  it('says so when a guard cuts the search short', () => {
    const k = kinship(THREE, 'CHILD', 'COUSIN', {maxDepth: 1, maxPaths: 10});
    expect(k.partial).toBe(true);
  });
});
