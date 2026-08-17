/**
 * Draws the ancestor network: one box per person, however many lines of
 * descent reach them.
 *
 * It is not a topola chart — topola's charts are d3 tree layouts and the whole
 * point here is not to be one — but it presents the same handle, draws into
 * the same `#chart` group and reports the same `ChartInfo`, so the zoom, the
 * pan, the saved scroll position and every export path keep working without
 * knowing the difference.
 */

import {select} from 'd3-selection';
import {ChartInfo, IndiInfo, JsonEvent, JsonGedcomData, JsonIndi} from 'topola';
import {
  ChartColors,
  DEFAULT_NETWORK_OPTIONS,
  NetworkOptions,
} from '../../sidepanel/config/config';
import {Fact, getCurrentEvidence} from '../../util/evidence';
import {evidenceLabels} from '../../util/evidence_labels';
import {citationCount, dotClass, dotCss, dotsFor} from '../evidence_dots';
import {
  AncestorNetwork,
  buildAncestorNetwork,
  lineThrough,
  settledUnions,
} from './graph';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LayoutEdge,
  layoutNetwork,
  LayoutNode,
  NetworkLayout,
  unionNodeId,
} from './layout';

/** What the pointer is over, and where it is, for the card in view_page. */
export interface HoverTarget {
  personId?: string;
  unionId?: string;
  box: DOMRect;
}

export interface AncestorNetworkOptions {
  json: JsonGedcomData;
  svgSelector: string;
  /** Make this person the root of the chart. Double-click, as of 17 Aug 2026. */
  onSelect?: (info: IndiInfo) => void;
  /** Show this person in the side panel without moving the chart. */
  onDetail?: (info: IndiInfo) => void;
  /** The pointer entered or left a box or a marriage node. */
  onHover?: (target: HoverTarget | undefined) => void;
  colors?: ChartColors;
  locale?: string;
  network?: NetworkOptions;
}

function yearOf(event?: JsonEvent): string | undefined {
  const date = event?.date ?? event?.dateRange?.from ?? event?.dateRange?.to;
  if (!date?.year) return undefined;
  return date.qualifier ? `~${date.year}` : `${date.year}`;
}

function lifespan(indi?: JsonIndi): string {
  const birth = yearOf(indi?.birth);
  const death = yearOf(indi?.death);
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `* ${birth}`;
  if (death) return `† ${death}`;
  return '';
}

function nameOf(indi?: JsonIndi): string {
  return [indi?.firstName, indi?.lastName].filter((part) => !!part).join(' ');
}

/** Cuts a label that would run out of its box, on a character estimate. */
function fit(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

function pathThrough(points: Array<[number, number]>): string {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const midpoint = (y0 + y1) / 2;
    d += ` C ${x0} ${midpoint} ${x1} ${midpoint} ${x1} ${y1}`;
  }
  return d;
}

/** The box grows with what is switched on, so the layout has to know first. */
function boxHeight(options: NetworkOptions): number {
  if (options.compact) return 32;
  return 52 + (options.dots || options.citations ? 15 : 0);
}

interface Line {
  blood: Set<string>;
  partners: Set<string>;
  unions: Set<string>;
}

export class AncestorNetworkChart {
  private options: AncestorNetworkOptions;
  private network?: AncestorNetwork;
  private layout?: NetworkLayout;
  private lines = new Map<string, Line>();
  /** The person whose line is held on screen, if the user clicked one. */
  private pinned?: string;
  private escapeListener?: (event: KeyboardEvent) => void;

  constructor(options: AncestorNetworkOptions) {
    this.options = options;
  }

  setData(json: JsonGedcomData) {
    this.options = {...this.options, json};
  }

  private get network_options(): NetworkOptions {
    return this.options.network ?? DEFAULT_NETWORK_OPTIONS;
  }

  render(renderOptions?: {startIndi?: string}): ChartInfo {
    const shown = this.network_options;
    const indis = new Map(
      this.options.json.indis.map((indi) => [indi.id, indi]),
    );
    const root =
      renderOptions?.startIndi ?? this.options.json.indis[0]?.id ?? '';
    const network = buildAncestorNetwork(this.options.json, root);
    // Ordering is quadratic in the edges between two rows; a very large
    // ancestry is better drawn quickly than perfectly.
    const layout = layoutNetwork(network, {
      ...DEFAULT_LAYOUT_OPTIONS,
      personHeight: boxHeight(shown),
      sweeps: network.persons.size > 600 ? 4 : DEFAULT_LAYOUT_OPTIONS.sweeps,
    });
    this.network = network;
    this.layout = layout;
    this.lines.clear();
    this.pinned = undefined;

    const evidenceWords = evidenceLabels(this.options.locale ?? 'en');
    const evidence = getCurrentEvidence();
    const byEvidence = this.options.colors === ChartColors.COLOR_BY_EVIDENCE;

    // "Fade what is settled" has to cover the lines and the joins as well as
    // the boxes, or two thirds of the chart goes quiet while every thread
    // between them stays at full strength.
    const settled = settledUnions(network, (id) => {
      const state = evidence?.persons.get(id)?.state;
      return state === 'urkunde' || state === 'zweitzeuge';
    });

    const chart = select(this.options.svgSelector);
    chart.selectAll('*').remove();
    chart.classed('network', true);
    chart.append('style').text(CSS);

    // Something for a click on empty space to land on, so the pinned line can
    // be let go of without hunting for the person it belongs to.
    chart
      .append('rect')
      .attr('class', 'backdrop')
      .attr('width', layout.width)
      .attr('height', layout.height)
      .on('click', () => this.show(undefined, {pin: true}));

    chart
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(layout.edges)
      .join('path')
      .attr('class', (edge) =>
        settled.has(edge.unionId) ? 'link settled' : 'link',
      )
      .attr('d', (edge) => pathThrough(edge.points));

    const unions = chart
      .append('g')
      .attr('class', 'unions')
      .selectAll('circle')
      .data(layout.nodes.filter((node) => node.kind === 'union'))
      .join('circle')
      .attr('class', (node) => {
        const marriage = this.marriageOf(node.unionId);
        const fade =
          node.unionId && settled.has(node.unionId) ? ' settled' : '';
        return shown.marriage && byEvidence
          ? `union evidence-${marriage ? marriage.bucket : 'keine'}${fade}`
          : `union${fade}`;
      })
      .attr('cx', (node) => node.x)
      .attr('cy', (node) => node.y + node.height / 2)
      .attr('r', shown.marriage ? 5 : 4);

    unions
      .on('mouseenter', (event: MouseEvent, node) =>
        this.options.onHover?.({
          unionId: node.unionId,
          box: (event.currentTarget as Element).getBoundingClientRect(),
        }),
      )
      .on('mouseleave', () => this.options.onHover?.(undefined));

    const people = chart
      .append('g')
      .attr('class', 'people')
      .selectAll('g')
      .data(layout.nodes.filter((node) => node.kind === 'person'))
      .join('g')
      .attr('class', (node) => this.personClass(node, byEvidence, evidence))
      .attr(
        'transform',
        (node) => `translate(${node.x - node.width / 2}, ${node.y})`,
      )
      // A plain click holds the line on screen and shows the person in the side
      // panel. It no longer re-roots -- that threw away everything below the
      // person, which is half of what there is to see. Re-rooting is the
      // double-click; the single click that precedes it is harmless, because
      // re-rooting redraws and drops the pin.
      .on('click', (event: MouseEvent, node) => {
        event.stopPropagation();
        this.show(this.pinned === node.id ? undefined : node.id, {pin: true});
        this.options.onDetail?.(this.infoFor(node, event));
      })
      .on('dblclick', (event: MouseEvent, node) => {
        event.stopPropagation();
        this.options.onSelect?.(this.infoFor(node, event));
      })
      .on('mouseenter', (event: MouseEvent, node) => {
        this.show(node.id);
        this.options.onHover?.({
          personId: node.id,
          box: (event.currentTarget as Element).getBoundingClientRect(),
        });
      })
      .on('mouseleave', () => {
        this.show(undefined);
        this.options.onHover?.(undefined);
      });

    people
      .append('rect')
      .attr('class', 'box')
      .attr('width', (node) => node.width)
      .attr('height', (node) => node.height)
      .attr('rx', 4);

    people
      .append('text')
      .attr('class', 'name')
      .attr('x', (node) => node.width / 2)
      .attr('y', shown.compact ? 20 : 21)
      .text((node) => fit(nameOf(indis.get(node.id)) || node.id, 26));

    if (!shown.compact) {
      people
        .append('text')
        .attr('class', 'years')
        .attr('x', (node) => node.width / 2)
        .attr('y', 38)
        .text((node) => lifespan(indis.get(node.id)));
    }

    // The bottom band: how each single fact is evidenced on the left, how much
    // evidence there is altogether on the right.
    if (!shown.compact && shown.dots) {
      const dots = people
        .append('g')
        .attr('class', 'evidence-dots')
        .attr('transform', (node) => `translate(12, ${node.height - 11})`);
      dots.each(function (node) {
        const person = evidence?.persons.get(node.id);
        if (!person) return;
        const group = this as SVGGElement;
        dotsFor(person).forEach((entry, index) => {
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('class', `fact ${dotClass(entry.fact)}`);
          circle.setAttribute('r', '3.5');
          circle.setAttribute('cx', String(index * 10));
          circle.setAttribute('cy', '0');
          group.appendChild(circle);
        });
      });
    }

    if (!shown.compact && shown.citations) {
      people
        .append('text')
        .attr('class', 'citations')
        .attr('x', (node) => node.width - 10)
        .attr('y', (node) => node.height - 7)
        .text((node) => {
          const person = evidence?.persons.get(node.id);
          return person ? evidenceWords.citations(citationCount(person)) : '';
        });
    }

    // The number that makes the collapse legible: how many separate places a
    // pedigree chart would have put this person in.
    if (shown.badges) {
      const repeated = people.filter((node) => (node.person?.paths ?? 1) > 1);
      repeated
        .append('rect')
        .attr('class', 'repeat')
        .attr('x', (node) => node.width - 30)
        .attr('y', 6)
        .attr('width', 24)
        .attr('height', 15)
        .attr('rx', 7.5);
      repeated
        .append('text')
        .attr('class', 'repeat-count')
        .attr('x', (node) => node.width - 18)
        .attr('y', 17)
        .text((node) => `×${node.person?.paths}`);
    }

    this.listenForEscape();

    return {
      size: [layout.width, layout.height],
      origin: layout.origin,
      animationPromise: Promise.resolve(),
    };
  }

  private infoFor(node: LayoutNode, event: MouseEvent): IndiInfo {
    return {
      id: node.id,
      generation: -(node.person?.rank ?? 0),
      modifiers: {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      },
    };
  }

  private marriageOf(unionId?: string): Fact | undefined {
    if (!unionId) return undefined;
    const facts = getCurrentEvidence()?.families.get(unionId) ?? [];
    return facts.find((fact) => fact.tag === 'MARR');
  }

  private personClass(
    node: LayoutNode,
    byEvidence: boolean,
    evidence: ReturnType<typeof getCurrentEvidence>,
  ) {
    const person = evidence?.persons.get(node.id);
    const classes = ['person', `state-${person?.state ?? 'keine'}`];
    if (byEvidence) classes.push(`evidence-${person?.state ?? 'keine'}`);
    if (person?.detached) classes.push('detached');
    else if (person?.frontier) classes.push('frontier');
    if ((node.person?.paths ?? 1) > 1) classes.push('repeated');
    if (node.id === this.network?.root) classes.push('is-root');
    return classes.join(' ');
  }

  private listenForEscape() {
    if (this.escapeListener)
      window.removeEventListener('keydown', this.escapeListener);
    this.escapeListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.show(undefined, {pin: true});
    };
    window.addEventListener('keydown', this.escapeListener);
  }

  /**
   * Lights up the whole line running through one person — their ancestry above
   * and their descent to the root below — and fades everything else.
   *
   * A pinned line stays until it is let go of, so hovering does nothing while
   * one is held; that is the difference between glancing at a line and reading
   * it while the mouse is somewhere else entirely.
   */
  private show(personId: string | undefined, args?: {pin: boolean}) {
    if (args?.pin) this.pinned = personId;
    else if (this.pinned) return;

    const chart = select(this.options.svgSelector);
    chart.selectAll('.on-path').classed('on-path', false);
    chart.selectAll('.on-path-soft').classed('on-path-soft', false);
    chart.selectAll('.partner').classed('partner', false);
    chart.selectAll('.pinned').classed('pinned', false);

    if (!personId || !this.network) {
      chart.classed('focused', false);
      return;
    }
    let line = this.lines.get(personId);
    if (!line) {
      line = lineThrough(this.network, personId);
      this.lines.set(personId, line);
    }
    const {blood, partners, unions} = line;

    chart.classed('focused', true);
    const persons = chart.selectAll<Element, LayoutNode>('g.person');
    persons.classed('on-path', (node) => blood.has(node.id));
    persons.classed('partner', (node) => partners.has(node.id));
    persons.classed('pinned', (node) => node.id === this.pinned);
    chart
      .selectAll<Element, LayoutNode>('circle.union')
      .classed('on-path', (node) => !!node.unionId && unions.has(node.unionId));

    // An edge belongs to the line only if both of its ends do. Deciding this by
    // the union alone -- which is what this used to do -- drew a dark line out
    // of the faded box of whoever married in, and lit up sibling branches above
    // the person that are no ancestors of theirs.
    const links = chart.selectAll<Element, LayoutEdge>('path.link');
    links.classed(
      'on-path',
      (edge) =>
        unions.has(edge.unionId) &&
        (edge.parentId
          ? blood.has(edge.parentId)
          : !!edge.childId && blood.has(edge.childId)),
    );
    links.classed(
      'on-path-soft',
      (edge) =>
        unions.has(edge.unionId) &&
        !!edge.parentId &&
        partners.has(edge.parentId),
    );
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS =
  `
g.network text {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-anchor: middle;
  pointer-events: none;
}
g.network rect.backdrop {
  fill: transparent;
}
g.network .name {
  font-size: 12px;
  font-weight: 600;
  fill: #222;
}
g.network .years {
  font-size: 11px;
  fill: #666;
}
g.network .citations {
  font-size: 9px;
  fill: #999;
  text-anchor: end;
}
g.network path.link {
  fill: none;
  stroke: #b9b9b9;
  stroke-width: 1.2px;
}
g.network circle.union {
  fill: #7f8c8d;
}
g.network g.person {
  cursor: pointer;
}
g.network rect.box {
  fill: #fff;
  stroke: #c8c8c8;
  stroke-width: 1px;
}
g.network g.person.is-root rect.box {
  stroke: #333;
  stroke-width: 2px;
}
g.network g.person.frontier rect.box {
  stroke: #c0392b;
  stroke-width: 2px;
}
g.network g.person.detached rect.box {
  stroke: #7d5ba6;
  stroke-width: 1.6px;
}
g.network g.person.evidence-urkunde rect.box { fill: #e3f4e1; }
g.network g.person.evidence-zweitzeuge rect.box { fill: #fff4d6; }
g.network g.person.evidence-hinweis rect.box { fill: #ffe0c2; }
g.network g.person.evidence-ohne rect.box { fill: #f2f2f2; }
g.network g.person.evidence-keine rect.box { fill: #fafafa; }
g.network circle.union.evidence-urkunde { fill: #3a9d5d; }
g.network circle.union.evidence-zweitzeuge { fill: #d9a400; }
g.network circle.union.evidence-hinweis { fill: #e07b2a; }
g.network circle.union.evidence-ohne,
g.network circle.union.evidence-keine { fill: #cfcfcf; stroke: #9a9a9a; stroke-width: 1px; }
g.network rect.repeat {
  fill: #34495e;
}
g.network text.repeat-count {
  font-size: 9px;
  font-weight: 700;
  fill: #fff;
}
/* Pointing at a person answers "how am I descended from them, and they from
   whom" -- the ancestry above and the descent below, at once. */
g.network.focused g.person:not(.on-path):not(.partner),
g.network.focused circle.union:not(.on-path),
g.network.focused path.link:not(.on-path):not(.on-path-soft) {
  opacity: 0.12;
}
g.network.focused path.link.on-path {
  stroke: #34495e;
  stroke-width: 2px;
}
/* Married in rather than descended: on the chart at full strength, because the
   line still runs out of their box, but without the line's own colour. */
g.network.focused g.person.partner rect.box {
  stroke-dasharray: 3 2;
}
g.network g.person.pinned rect.box {
  stroke: #34495e;
  stroke-width: 2.5px;
}
/* Fading what is proven: the boxes, the joins between them and the lines that
   run into those joins, so what is left standing is the open work and the
   threads that lead to it. A line being pointed at always wins -- that is a
   deliberate question, and the fade is only a standing filter. */
#chart.dim-settled g.person.state-urkunde:not(.on-path):not(.partner),
#chart.dim-settled g.person.state-zweitzeuge:not(.on-path):not(.partner) {
  opacity: 0.25;
}

#chart.dim-settled path.link.settled:not(.on-path):not(.on-path-soft),
#chart.dim-settled circle.union.settled:not(.on-path) {
  opacity: 0.15;
}
` + dotCss('g.network .evidence-dots');

export {unionNodeId};
