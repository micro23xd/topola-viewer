/**
 * The row of dots that says how each single fact is evidenced.
 *
 * Birth, death and every marriage, in that order, each coloured by that one
 * fact's own `QUAY` rather than by the person's worst — the box fill already
 * carries the worst, and the interesting question is usually which of the three
 * is the weak one. Missing facts get a hollow dot, because "no birth recorded"
 * and "birth recorded without a source" are different problems.
 *
 * Shared by the box charts and the ancestor network so the two never drift
 * apart in either colour or wording.
 */

import {Fact, PersonEvidence} from '../util/evidence';
import {EvidenceLabels, tagLabel} from '../util/evidence_labels';

/** The dots a person gets, in a fixed order, missing facts included. */
export function dotsFor(
  person: PersonEvidence,
): Array<{tag: string; fact?: Fact}> {
  return [
    {tag: 'BIRT', fact: person.birthLike},
    {tag: 'DEAT', fact: person.deathLike},
    ...person.marriages.map((fact) => ({tag: 'MARR', fact})),
  ];
}

export function dotClass(fact?: Fact): string {
  if (!fact) return 'quay-missing';
  if (fact.bestQuay === undefined) return 'quay-none';
  return `quay-${fact.bestQuay}`;
}

export function dotTitle(
  tag: string,
  fact: Fact | undefined,
  labels: EvidenceLabels,
) {
  const label = tagLabel(labels, fact?.tag ?? tag);
  if (!fact) return `${label}: ${labels.notRecorded}`;
  return (
    `${label}: ${labels.bucket[fact.bucket]} (${labels.quay(fact.bestQuay)}), ` +
    labels.citations(fact.citations.length)
  );
}

/**
 * How many citations stand behind the person altogether.
 *
 * Their marriages count: they are the person's facts as much as their birth is,
 * they are what the dots above already show, and a count that left them out
 * would disagree with the dots beside it.
 */
export function citationCount(person: PersonEvidence): number {
  return factsOf(person).reduce(
    (total, fact) => total + fact.citations.length,
    0,
  );
}

/** Everything evidenced about a person, their marriages included. */
export function factsOf(person: PersonEvidence): Fact[] {
  return [...person.facts, ...person.marriages];
}

/**
 * The dot palette, as CSS rules under whatever selector prefix the caller
 * draws them with.
 */
export function dotCss(prefix: string) {
  return `
${prefix} circle.fact {
  stroke: none;
}

${prefix} circle.quay-3 {
  fill: #3a9d5d;
}

${prefix} circle.quay-2 {
  fill: #d9a400;
}

${prefix} circle.quay-1,
${prefix} circle.quay-0 {
  fill: #e07b2a;
}

${prefix} circle.quay-none {
  fill: #9a9a9a;
}

${prefix} circle.quay-missing {
  fill: #ffffff;
  stroke: #c8c8c8;
  stroke-width: 1px;
}
`;
}
