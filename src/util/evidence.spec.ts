import {describe, expect, it} from '@jest/globals';
import {parse as parseGedcom} from 'parse-gedcom';
import {computeEvidence, Fact, PersonEvidence} from './evidence';
import {prepareGedcom} from './gedcom_util';

/**
 * A miniature tree with one of every case the audit distinguishes: a fact
 * proven by a register, one resting on a gravestone, one on a compiled tree
 * with and without an explaining NOTE, one with no citation at all, a marriage,
 * an ancestor whose parents are nameless, and a detached pair.
 */
const FIXTURE = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Dominik /Bauer/
1 SEX M
1 BIRT
2 DATE 1 JAN 1989
2 SOUR @S1@
3 PAGE Standesamt, Nr. 5
3 QUAY 3
1 FAMC @F1@
0 @I2@ INDI
1 NAME Peter /Bauer/
1 SEX M
1 NOTE Ein Grabstein nennt ihn, die Kirchenbücher noch nicht.
1 BIRT
2 DATE ABT 1620
2 SOUR @S2@
3 QUAY 1
1 DEAT
2 DATE 23 FEB 1671
2 SOUR @S1@
3 PAGE Sterbebuch, S. 12
3 QUAY 3
2 SOUR @S1@
3 PAGE Rechnungsbuch 1671, fol. 4
3 QUAY 3
1 BURI
2 PLAC Bieber
2 SOUR @S3@
3 QUAY 2
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Margarethe /Unbekannt/
1 SEX F
1 BIRT
2 DATE ABT 1625
1 FAMS @F1@
0 @I4@ INDI
1 NAME Anna /Merz/
1 SEX F
1 BIRT
2 DATE 1700
2 SOUR @S_MH_JAEGER@
3 QUAY 3
0 @I5@ INDI
1 NAME Karl /Kummerant/
1 SEX M
1 BIRT
2 DATE 1880
2 SOUR @S2@
3 QUAY 1
1 FAMS @F3@
0 @I6@ INDI
1 NAME Elisabeth /Weber/
1 SEX F
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 12 MAY 1645
2 SOUR @S1@
3 PAGE Traubuch, S. 3
3 QUAY 3
3 NOTE Trauzeugen genannt.
0 @F2@ FAM
1 CHIL @I2@
0 @F3@ FAM
1 HUSB @I5@
1 WIFE @I6@
1 MARR
2 DATE 1905
0 @S1@ SOUR
1 TITL Kirchenbuch Bieber
0 @S2@ SOUR
1 TITL Kompilierter Baum
0 @S3@ SOUR
1 TITL Grabsteinfoto
0 @S_MH_JAEGER@ SOUR
1 TITL Ahnenliste der Bieberer Ortsforschung
0 TRLR
`;

const index = computeEvidence(prepareGedcom(parseGedcom(FIXTURE)));

function person(id: string): PersonEvidence {
  const found = index.persons.get(id);
  if (!found) throw new Error(`no such person: ${id}`);
  return found;
}

function fact(candidate: Fact | undefined): Fact {
  if (!candidate) throw new Error('expected a fact');
  return candidate;
}

describe('computeEvidence()', () => {
  it('buckets a fact by the best QUAY of its citations', () => {
    const peter = person('I2');
    expect(fact(peter.birthLike).bucket).toBe('hinweis');
    expect(fact(peter.deathLike).bucket).toBe('urkunde');
    expect(fact(peter.facts.find((f) => f.tag === 'BURI')).bucket).toBe(
      'zweitzeuge',
    );
  });

  it('keeps two citations of the same source on different pages', () => {
    const death = fact(person('I2').deathLike);
    expect(death.citations.map((c) => c.page)).toEqual([
      'Sterbebuch, S. 12',
      'Rechnungsbuch 1671, fol. 4',
    ]);
  });

  it('counts a fact with no citation as ohne Quelle', () => {
    expect(fact(person('I3').birthLike).bucket).toBe('ohne');
  });

  it('says keine when a person asserts nothing at all', () => {
    // Elisabeth Weber has no dated event of her own; her state comes from the
    // marriage alone, and Margarethe's parent family asserts nothing.
    expect(person('I6').facts).toHaveLength(0);
    expect(index.families.get('F2')).toEqual([]);
  });

  it('takes the worst bucket, marriages included, as the person state', () => {
    // Registers for the death, a compiled tree for the birth: still work to do.
    expect(person('I2').state).toBe('hinweis');
    // Own birth is urkundlich, but the marriage of his family is not cited.
    expect(person('I5').state).toBe('ohne');
    expect(person('I5').marriages).toHaveLength(1);
  });

  it('flags a QUAY ≤ 1 fact only when the record explains nothing', () => {
    expect(fact(person('I2').birthLike).unexplained).toBe(false);
    expect(fact(person('I5').birthLike).unexplained).toBe(true);
  });

  it('flags an Ortsforschung citation that carries no page', () => {
    expect(fact(person('I4').birthLike).pending).toBe(true);
    expect(fact(person('I1').birthLike).pending).toBe(false);
  });

  it('reads a citation note', () => {
    expect((index.families.get('F1') ?? [])[0].citations[0].notes).toEqual([
      'Trauzeugen genannt.',
    ]);
  });

  it('calls parents unknown a frontier, empty parent family included', () => {
    expect(person('I1').frontier).toBe(false);
    // @F2@ names him as a child but has neither husband nor wife.
    expect(person('I2').frontier).toBe(true);
    expect(person('I4').frontier).toBe(true);
  });

  it('detaches everyone unreachable from the seed person', () => {
    expect(person('I3').detached).toBe(false);
    expect(index.queues.detached.sort()).toEqual(['I4', 'I5', 'I6']);
  });

  it('summarises every fact of both individuals and families', () => {
    expect(index.summary).toEqual({
      facts: 9,
      urkunde: 4,
      zweitzeuge: 1,
      hinweis: 2,
      ohne: 2,
    });
  });

  it('fills the work queues', () => {
    expect(index.queues.ohne.map((f) => f.owner)).toEqual(['I3', 'F3']);
    expect(index.queues.hinweis.map((f) => f.owner)).toEqual(['I2', 'I5']);
    expect(index.queues.unexplained.map((f) => f.owner)).toEqual(['I5']);
    expect(index.queues.pending.map((f) => f.owner)).toEqual(['I4']);
  });
});
