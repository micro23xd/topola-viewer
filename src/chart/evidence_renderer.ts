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
import {CircleRenderer, DetailedRenderer, TreeNodeSelection} from 'topola';
import {Bucket, getCurrentEvidence} from '../util/evidence';
import {evidenceLabels} from '../util/evidence_labels';
import {dotClass, dotCss, dotsFor, dotTitle} from './evidence_dots';

/** Height of one details line in DetailedRenderer; the dots row is one more. */
const DETAILS_HEIGHT = 14;

/** The datum d3 binds to a `g.indi` group inside DetailedRenderer. */
interface OffsetIndiLike {
  indi: {id: string; width?: number; height?: number};
}

/** Worse of two states, so a couple's circle shows the open question. */
const STATE_ORDER: Bucket[] = [
  'ohne',
  'hinweis',
  'zweitzeuge',
  'urkunde',
  'keine',
];

function worseState(a: Bucket, b: Bucket): Bucket {
  return STATE_ORDER.indexOf(a) <= STATE_ORDER.indexOf(b) ? a : b;
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

    const labels = evidenceLabels(this.options.locale);

    const personOf = (data: OffsetIndiLike) =>
      evidence.persons.get(data.indi.id);

    // A class per state on the group itself, so that "show me only the open
    // work" is a stylesheet change rather than another render pass.
    groups.attr('class', (data) => {
      const person = personOf(data);
      return `indi state-${person?.state ?? 'keine'}${
        person?.frontier ? ' is-frontier' : ''
      }${person?.detached ? ' is-detached' : ''}`;
    });

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

    // The family box carries the marriage; colour it by the marriage's own
    // evidence rather than leaving it white next to two coloured people.
    const families = selection.selectAll('g.family') as unknown as Selection<
      BaseType,
      {data: {family?: {id: string}}},
      BaseType,
      unknown
    >;
    families.select('rect').attr('class', function (node) {
      const id = node.data.family?.id;
      const facts = id ? (evidence.families.get(id) ?? []) : [];
      const marriage = facts.find((fact) => fact.tag === 'MARR');
      const existing = ((this as Element).getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('evidence-'))
        .join(' ');
      return `${existing} evidence-${marriage ? marriage.bucket : 'keine'}`;
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
        title.textContent = dotTitle(entry.tag, entry.fact, labels);
        circle.appendChild(title);
        group.appendChild(circle);
      });
    });
  }

  getCss() {
    return (
      super.getCss() +
      `
.detailed rect.evidence-urkunde {
  fill: #e3f4e1;
}

.detailed rect.evidence-zweitzeuge {
  fill: #fff4d6;
}

.detailed rect.evidence-hinweis {
  fill: #ffe0c2;
}

.detailed rect.evidence-ohne {
  fill: #f2f2f2;
}

.detailed rect.evidence-keine {
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

` +
      dotCss('.detailed .evidence-dots') +
      `
/* "Only the open work": everything already settled fades into the background,
   which on a tree this size is the difference between a wall and a to-do list. */
#chart.dim-settled g.indi.state-urkunde:not(.on-path):not(.partner),
#chart.dim-settled g.indi.state-zweitzeuge:not(.on-path):not(.partner) {
  opacity: 0.25;
}

#chart.dim-settled g.family {
  opacity: 0.4;
}`
    );
  }
}

/**
 * The same colouring on the fan chart. There is far less room here — no dots,
 * no borders — so the circle is simply filled by the person's state, and a
 * couple's circle takes the worse of the two.
 */
export class EvidenceCircleRenderer extends CircleRenderer {
  render(enter: TreeNodeSelection, update: TreeNodeSelection): void {
    super.render(enter, update);
    this.decorate(enter);
    this.decorate(update);
  }

  private decorate(selection: TreeNodeSelection) {
    const evidence = getCurrentEvidence();
    if (!evidence || selection.empty()) return;
    selection.selectAll('circle').attr('class', function (node) {
      // The circle inherits the hierarchy node, so the people are one level in.
      const data =
        (node as {data?: {indi?: {id: string}; spouse?: {id: string}}}).data ??
        {};
      const states = [data.indi?.id, data.spouse?.id]
        .filter((id): id is string => !!id)
        .map((id) => evidence.persons.get(id)?.state ?? 'keine');
      const state = states.length
        ? states.reduce((a, b) => worseState(a, b))
        : 'keine';
      return `evidence-${state}`;
    });
  }

  getCss() {
    return (
      super.getCss() +
      `
    circle.evidence-urkunde { fill: #e3f4e1; }
    circle.evidence-zweitzeuge { fill: #fff4d6; }
    circle.evidence-hinweis { fill: #ffe0c2; }
    circle.evidence-ohne { fill: #f2f2f2; }
    circle.evidence-keine { fill: #fafafa; }
    `
    );
  }
}
