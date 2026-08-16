/**
 * Draws the chart the way the research reads it: every box filled by how well
 * the person is evidenced, bordered red where their parents are unknown, and
 * carrying a row of dots — birth, death, marriages — coloured by the QUAY of
 * that single fact.
 *
 * It extends topola's DetailedRenderer instead of copying it. `render`,
 * `getCss` and `getPreferredIndiSize` are the only three seams needed, all
 * public, so upstream can move underneath this file without a merge conflict.
 * The decoration is a pass over the SVG that super has just built: the `g.indi`
 * groups are bound to the individual they draw, which is all we need.
 */

import {BaseType, Selection} from 'd3-selection';
import {DetailedRenderer, TreeNodeSelection} from 'topola';
import {
  Bucket,
  Fact,
  getCurrentEvidence,
  PersonEvidence,
} from '../util/evidence';

/** Height of one details line in DetailedRenderer; the dots row is one more. */
const DETAILS_HEIGHT = 14;

/** The datum d3 binds to a `g.indi` group inside DetailedRenderer. */
interface OffsetIndiLike {
  indi: {id: string; width?: number; height?: number};
}

const FACT_LABELS: {[tag: string]: string} = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Begräbnis',
  MARR: 'Heirat',
};

const BUCKET_LABELS: {[key in Bucket]: string} = {
  urkunde: 'urkundlich',
  zweitzeuge: 'Zweitzeuge',
  hinweis: 'nur Hinweis',
  ohne: 'ohne Quelle',
  keine: 'nichts belegt',
};

/** The dots a person gets, in a fixed order, missing facts included. */
function dotsFor(person: PersonEvidence): Array<{tag: string; fact?: Fact}> {
  return [
    {tag: 'BIRT', fact: person.birthLike},
    {tag: 'DEAT', fact: person.deathLike},
    ...person.marriages.map((fact) => ({tag: 'MARR', fact})),
  ];
}

function dotClass(fact?: Fact): string {
  if (!fact) return 'quay-missing';
  if (fact.bestQuay === undefined) return 'quay-none';
  return `quay-${fact.bestQuay}`;
}

function dotTitle(tag: string, fact?: Fact): string {
  const label = FACT_LABELS[fact?.tag ?? tag] ?? tag;
  if (!fact) return `${label}: nicht erfasst`;
  const quay =
    fact.bestQuay !== undefined ? ` (QUAY ${fact.bestQuay})` : ' (ohne QUAY)';
  const count = fact.citations.length;
  const belege =
    count === 0 ? 'kein Beleg' : count === 1 ? '1 Beleg' : `${count} Belege`;
  return `${label}: ${BUCKET_LABELS[fact.bucket]}${quay}, ${belege}`;
}

export class EvidenceRenderer extends DetailedRenderer {
  getPreferredIndiSize(id: string): [number, number] {
    const [width, height] = super.getPreferredIndiSize(id);
    return [width, height + DETAILS_HEIGHT];
  }

  render(enter: TreeNodeSelection, update: TreeNodeSelection): void {
    super.render(enter, update);
    this.decorate(enter);
    this.decorate(update);
  }

  private decorate(selection: TreeNodeSelection) {
    const evidence = getCurrentEvidence();
    if (!evidence || selection.empty()) return;

    const groups = selection.selectAll('g.indi') as unknown as Selection<
      BaseType,
      OffsetIndiLike,
      BaseType,
      unknown
    >;

    const personOf = (data: OffsetIndiLike) =>
      evidence.persons.get(data.indi.id);

    groups.select('rect.background').attr('class', function (data) {
      const person = personOf(data as OffsetIndiLike);
      const existing = (this as Element).getAttribute('class') ?? '';
      const stripped = existing
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('evidence-'))
        .join(' ');
      return `${stripped} evidence-${person?.state ?? 'keine'}`;
    });

    groups.select('rect.border').attr('class', function (data) {
      const person = personOf(data as OffsetIndiLike);
      // Detached wins over frontier, as in the Graphviz chart: someone who is
      // not attached to the tree at all is a different kind of open question.
      const flag = person?.detached
        ? ' detached'
        : person?.frontier
          ? ' frontier'
          : '';
      return `border${flag}`;
    });

    // The dots row sits above the id/sex line, in the space getPreferredIndiSize
    // reserved for it.
    groups.selectAll('g.evidence-dots').remove();
    const dots = groups
      .append('g')
      .attr('class', 'evidence-dots')
      .attr('transform', (data) => {
        const indi = this.options.data.getIndi(data.indi.id);
        const bottomLine =
          indi?.showId() || indi?.showSex() ? DETAILS_HEIGHT : 0;
        return `translate(9, ${(data.indi.height ?? 0) - 7 - bottomLine})`;
      });

    dots.each(function (data) {
      const person = personOf(data);
      if (!person) return;
      const group = this as Element as SVGGElement;
      dotsFor(person).forEach((entry, i) => {
        const circle = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'circle',
        );
        circle.setAttribute('class', `fact ${dotClass(entry.fact)}`);
        circle.setAttribute('r', '3.5');
        circle.setAttribute('cx', String(i * 10));
        circle.setAttribute('cy', '0');
        const title = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'title',
        );
        title.textContent = dotTitle(entry.tag, entry.fact);
        circle.appendChild(title);
        group.appendChild(circle);
      });
    });
  }

  getCss() {
    return (
      super.getCss() +
      `
.detailed rect.background.evidence-urkunde {
  fill: #e3f4e1;
}

.detailed rect.background.evidence-zweitzeuge {
  fill: #fff4d6;
}

.detailed rect.background.evidence-hinweis {
  fill: #ffe0c2;
}

.detailed rect.background.evidence-ohne {
  fill: #f2f2f2;
}

.detailed rect.background.evidence-keine {
  fill: #fafafa;
}

.detailed rect.border.frontier {
  stroke: #c0392b;
  stroke-width: 2.5px;
}

.detailed rect.border.detached {
  stroke: #7d5ba6;
  stroke-width: 2.5px;
}

.detailed .evidence-dots circle.fact {
  stroke: none;
}

.detailed .evidence-dots circle.quay-3 {
  fill: #3a9d5d;
}

.detailed .evidence-dots circle.quay-2 {
  fill: #d9a400;
}

.detailed .evidence-dots circle.quay-1,
.detailed .evidence-dots circle.quay-0 {
  fill: #e07b2a;
}

.detailed .evidence-dots circle.quay-none {
  fill: #9a9a9a;
}

.detailed .evidence-dots circle.quay-missing {
  fill: #ffffff;
  stroke: #c8c8c8;
  stroke-width: 1px;
}`
    );
  }
}
