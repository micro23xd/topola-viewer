/**
 * The one test that cannot run on a fixture.
 *
 * `util/evidence.ts` is a port of a Python script that maintains a real, private
 * GEDCOM; the whole point of the port is that both produce the same numbers, and
 * a fixture cannot show that. So this test reads a file and an expected summary
 * whose paths come from the environment, and skips itself when they are not
 * set — which is every run except the one the family-tree repository's
 * `make check-viewer` starts.
 *
 *   GEDCOM_PATH=…/family-tree.ged EXPECTED_JSON=…/validate.json npx jest evidence_crosscheck
 */

import {describe, expect, it} from '@jest/globals';
import {readFileSync} from 'fs';
import {parse as parseGedcom} from 'parse-gedcom';
import {computeEvidence} from './evidence';
import {prepareGedcom} from './gedcom_util';

const gedcomPath = process.env.GEDCOM_PATH;
const expectedPath = process.env.EXPECTED_JSON;
const configured = !!gedcomPath && !!expectedPath;

(configured ? describe : describe.skip)('evidence vs validate.py', () => {
  it('reports the same summary and the same queue sizes', () => {
    const gedcom = prepareGedcom(
      parseGedcom(readFileSync(gedcomPath as string, 'utf8')),
    );
    const index = computeEvidence(gedcom);
    const expected = JSON.parse(readFileSync(expectedPath as string, 'utf8'));

    expect({
      individuals: index.persons.size,
      families: index.families.size,
      facts: index.summary.facts,
      urkunde: index.summary.urkunde,
      zweitzeuge: index.summary.zweitzeuge,
      hinweis: index.summary.hinweis,
      ohne: index.summary.ohne,
      queues: {
        ohne: index.queues.ohne.length,
        hinweis: index.queues.hinweis.length,
        unexplained: index.queues.unexplained.length,
        pending: index.queues.pending.length,
        frontier: index.queues.frontier.length,
        detached: index.queues.detached.length,
      },
    }).toEqual(expected);
  });
});
