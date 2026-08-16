import {describe, expect, it} from '@jest/globals';
import {JsonGedcomData} from 'topola';
import {buildAncestorNetwork} from './graph';
import {
  DEFAULT_LAYOUT_OPTIONS,
  LayoutNode,
  layoutNetwork,
  unionNodeId,
} from './layout';

/** Four generations with one collapse and one line reaching a row higher. */
function tree(): JsonGedcomData {
  return {
    indis: [
      {id: 'R', famc: 'fAB'},
      {id: 'A', famc: 'fCD', fams: ['fAB']},
      {id: 'B', famc: 'fEF', fams: ['fAB']},
      {id: 'C', famc: 'fGH', fams: ['fCD']},
      {id: 'D', fams: ['fCD']},
      {id: 'E', famc: 'fGH', fams: ['fEF']},
      {id: 'F', fams: ['fEF']},
      {id: 'G', famc: 'fIJ', fams: ['fGH']},
      {id: 'H', fams: ['fGH']},
      {id: 'I', fams: ['fIJ']},
      {id: 'J', fams: ['fIJ']},
    ],
    fams: [
      {id: 'fAB', husb: 'A', wife: 'B', children: ['R']},
      {id: 'fCD', husb: 'C', wife: 'D', children: ['A']},
      {id: 'fEF', husb: 'E', wife: 'F', children: ['B']},
      {id: 'fGH', husb: 'G', wife: 'H', children: ['C', 'E']},
      {id: 'fIJ', husb: 'I', wife: 'J', children: ['G']},
    ],
  };
}

function laidOut() {
  return layoutNetwork(buildAncestorNetwork(tree(), 'R'));
}

function node(nodes: LayoutNode[], id: string): LayoutNode {
  const found = nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

describe('the network layout', () => {
  it('puts the root at the bottom and each generation above the last', () => {
    const layout = laidOut();
    const y = (id: string) => node(layout.nodes, id).y;
    expect(y('R')).toBeGreaterThan(y('A'));
    expect(y('A')).toBeGreaterThan(y('C'));
    expect(y('C')).toBeGreaterThan(y('G'));
    expect(y('G')).toBeGreaterThan(y('I'));
    // Everyone in the same generation shares a row.
    expect(y('A')).toBe(y('B'));
    expect(y('C')).toBe(y('E'));
  });

  it('draws the shared couple once, on the row below their earliest child', () => {
    const layout = laidOut();
    expect(layout.nodes.filter((n) => n.kind === 'person').length).toBe(11);
    expect(node(layout.nodes, 'G').y).toBe(node(layout.nodes, 'H').y);
    // Their union feeds two children, so two edges leave it downwards.
    const fromUnion = layout.edges.filter(
      (edge) => edge.unionId === 'fGH' && edge.childId,
    );
    expect(fromUnion.map((edge) => edge.childId).sort()).toEqual(['C', 'E']);
  });

  it('never lets two boxes in a row touch', () => {
    const layout = laidOut();
    const rows = new Map<number, LayoutNode[]>();
    layout.nodes.forEach((n) => rows.set(n.y, (rows.get(n.y) ?? []).concat(n)));
    rows.forEach((row) => {
      const sorted = row.slice().sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap =
          sorted[i].x -
          sorted[i].width / 2 -
          (sorted[i - 1].x + sorted[i - 1].width / 2);
        expect(gap).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_OPTIONS.hGap - 0.01);
      }
    });
  });

  it('routes an edge that skips a generation through waypoints', () => {
    // Make G an ancestor twice over, once three generations up and once five,
    // by marrying his daughter's son to C's wife's line. His box then has to
    // sit two rows above the union that joins him to C, and the edge between
    // them crosses the rows in between.
    const data = tree();
    data.indis.push(
      {id: 'K', famc: 'fGH', fams: ['fKL']},
      {id: 'L', fams: ['fKL']},
      {id: 'M', famc: 'fKL', fams: ['fCD']},
    );
    data.fams.push({id: 'fKL', husb: 'L', wife: 'K', children: ['M']});
    data.indis = data.indis.filter((indi) => indi.id !== 'D');
    data.fams = data.fams.map((fam) =>
      fam.id === 'fCD' ? {...fam, wife: 'M'} : fam,
    );
    const layout = layoutNetwork(buildAncestorNetwork(data, 'R'));
    expect(layout.nodes.some((n) => n.kind === 'waypoint')).toBe(true);
    // Every edge is drawn top-down: each point is at or below the last.
    layout.edges.forEach((edge) => {
      for (let i = 1; i < edge.points.length; i++) {
        expect(edge.points[i][1]).toBeGreaterThanOrEqual(
          edge.points[i - 1][1] - 0.01,
        );
      }
    });
  });

  it('reports a canvas that contains everything it drew', () => {
    const layout = laidOut();
    layout.nodes.forEach((n) => {
      expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    });
    expect(layout.origin[1]).toBeGreaterThan(layout.height / 2);
    expect(layout.byId.get(unionNodeId('fGH'))?.kind).toBe('union');
  });
});
