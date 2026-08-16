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
import {ChartColors} from '../../sidepanel/config/config';
import {getCurrentEvidence} from '../../util/evidence';
import {AncestorNetwork, buildAncestorNetwork, descentCone} from './graph';
import {
  DEFAULT_LAYOUT_OPTIONS,
  layoutNetwork,
  LayoutNode,
  NetworkLayout,
  unionNodeId,
} from './layout';

export interface AncestorNetworkOptions {
  json: JsonGedcomData;
  svgSelector: string;
  indiCallback?: (info: IndiInfo) => void;
  colors?: ChartColors;
  locale?: string;
}

interface Labels {
  repeated: (paths: number) => string;
  root: string;
  parentsUnknown: string;
  detached: string;
}

function labelsFor(locale?: string): Labels {
  const german = (locale ?? 'en').startsWith('de');
  return german
    ? {
        repeated: (paths) => `${paths} Abstammungswege`,
        root: 'Ausgangsperson',
        parentsUnknown: 'Eltern unbekannt',
        detached: 'nicht verbunden',
      }
    : {
        repeated: (paths) => `${paths} lines of descent`,
        root: 'starting person',
        parentsUnknown: 'parents unknown',
        detached: 'unattached',
      };
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

export class AncestorNetworkChart {
  private options: AncestorNetworkOptions;
  private network?: AncestorNetwork;
  private layout?: NetworkLayout;
  private cones = new Map<string, {people: Set<string>; unions: Set<string>}>();

  constructor(options: AncestorNetworkOptions) {
    this.options = options;
  }

  setData(json: JsonGedcomData) {
    this.options = {...this.options, json};
  }

  render(renderOptions?: {startIndi?: string}): ChartInfo {
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
      sweeps: network.persons.size > 600 ? 4 : DEFAULT_LAYOUT_OPTIONS.sweeps,
    });
    this.network = network;
    this.layout = layout;
    this.cones.clear();

    const labels = labelsFor(this.options.locale);
    const evidence = getCurrentEvidence();
    const byEvidence = this.options.colors === ChartColors.COLOR_BY_EVIDENCE;

    const chart = select(this.options.svgSelector);
    chart.selectAll('*').remove();
    chart.classed('network', true);
    chart.append('style').text(CSS);

    chart
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(layout.edges)
      .join('path')
      .attr('class', (edge) => `link link-${edge.unionId}`)
      .attr('d', (edge) => pathThrough(edge.points));

    chart
      .append('g')
      .attr('class', 'unions')
      .selectAll('circle')
      .data(layout.nodes.filter((node) => node.kind === 'union'))
      .join('circle')
      .attr('class', (node) => `union union-${node.unionId}`)
      .attr('cx', (node) => node.x)
      .attr('cy', (node) => node.y + node.height / 2)
      .attr('r', 4);

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
      .on('click', (event: MouseEvent, node) => {
        this.options.indiCallback?.({
          id: node.id,
          generation: -(node.person?.rank ?? 0),
          modifiers: {
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
          },
        });
      })
      .on('mouseenter', (_event: MouseEvent, node) => this.focus(node.id))
      .on('mouseleave', () => this.focus(undefined));

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
      .attr('y', 21)
      .text((node) => fit(nameOf(indis.get(node.id)) || node.id, 26));

    people
      .append('text')
      .attr('class', 'years')
      .attr('x', (node) => node.width / 2)
      .attr('y', 38)
      .text((node) => lifespan(indis.get(node.id)));

    // The number that makes the collapse legible: how many separate places a
    // pedigree chart would have put this person in.
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

    people.append('title').text((node) => {
      const person = evidence?.persons.get(node.id);
      const parts = [
        `${nameOf(indis.get(node.id)) || node.id}${
          lifespan(indis.get(node.id))
            ? `, ${lifespan(indis.get(node.id))}`
            : ''
        }`,
      ];
      if ((node.person?.paths ?? 1) > 1)
        parts.push(labels.repeated(node.person?.paths ?? 1));
      if (node.id === root) parts.push(labels.root);
      if (person?.frontier) parts.push(labels.parentsUnknown);
      if (person?.detached) parts.push(labels.detached);
      return parts.join(' · ');
    });

    return {
      size: [layout.width, layout.height],
      origin: layout.origin,
      animationPromise: Promise.resolve(),
    };
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

  /**
   * Lights up the lines of descent that put one person on the chart, which is
   * the question a repeated ancestor raises and a tree layout cannot answer.
   */
  private focus(personId: string | undefined) {
    const chart = select(this.options.svgSelector);
    if (!personId || !this.network) {
      chart.classed('focused', false);
      chart.selectAll('.on-path').classed('on-path', false);
      return;
    }
    let cone = this.cones.get(personId);
    if (!cone) {
      cone = descentCone(this.network, personId);
      this.cones.set(personId, cone);
    }
    chart.selectAll('.on-path').classed('on-path', false);
    chart.classed('focused', true);
    chart
      .selectAll<Element, LayoutNode>('g.person')
      .classed('on-path', (node) => cone.people.has(node.id));
    chart
      .selectAll<Element, LayoutNode>('circle.union')
      .classed(
        'on-path',
        (node) => !!node.unionId && cone.unions.has(node.unionId),
      );
    chart
      .selectAll<Element, {unionId: string}>('path.link')
      .classed('on-path', (edge) => cone.unions.has(edge.unionId));
  }
}

const CSS = `
g.network text {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-anchor: middle;
  pointer-events: none;
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
g.network rect.repeat {
  fill: #34495e;
}
g.network text.repeat-count {
  font-size: 9px;
  font-weight: 700;
  fill: #fff;
}
/* Hovering a repeated ancestor answers "how do I descend from this person". */
g.network.focused g.person:not(.on-path),
g.network.focused circle.union:not(.on-path),
g.network.focused path.link:not(.on-path) {
  opacity: 0.12;
}
g.network.focused path.link.on-path {
  stroke: #34495e;
  stroke-width: 2px;
}
#chart.dim-settled g.person.state-urkunde,
#chart.dim-settled g.person.state-zweitzeuge {
  opacity: 0.25;
}
`;

export {unionNodeId};
