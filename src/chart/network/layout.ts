/**
 * A layered layout for the ancestor network.
 *
 * The graph from `graph.ts` is a DAG whose nodes already know which generation
 * they belong to, so the hard part of a general graph layout — deciding the
 * rows — is done. What is left is the classic Sugiyama remainder: give every
 * edge that skips a generation a chain of invisible waypoints, order each row
 * so that as few edges cross as possible, and then push the nodes sideways
 * towards the people they are joined to.
 *
 * Deliberately dependency-free. dagre is unmaintained and elkjs is a megabyte
 * and a half; the rows are given to us and the graphs here are a few hundred
 * nodes, so a barycentre sweep and a two-pass compaction do the job and the
 * built app keeps making no requests to anything.
 */

import {AncestorNetwork, NetworkPerson, personLayer, unionLayer} from './graph';

export type NodeKind = 'person' | 'union' | 'waypoint';

export interface LayoutNode {
  id: string;
  kind: NodeKind;
  /** Set on person nodes. */
  person?: NetworkPerson;
  /** Set on union nodes. */
  unionId?: string;
  layer: number;
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  /** The parent's half of the edge carries the parent; the child's the child. */
  parentId?: string;
  childId?: string;
  unionId: string;
  points: Array<[number, number]>;
}

export interface NetworkLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  byId: Map<string, LayoutNode>;
  width: number;
  height: number;
  /** Middle of the root person's box, for centring the initial view. */
  origin: [number, number];
}

export interface LayoutOptions {
  personWidth: number;
  personHeight: number;
  /** Smallest gap between two boxes in the same row. */
  hGap: number;
  /** Gap between a generation row and the union row below it. */
  vGap: number;
  margin: number;
  /** Ordering sweeps. Eight is well past the point where it stops improving. */
  sweeps: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  personWidth: 186,
  personHeight: 52,
  hGap: 18,
  vGap: 34,
  margin: 40,
  sweeps: 8,
};

const UNION_SIZE = 10;

interface RawEdge {
  upper: string;
  lower: string;
  parentId?: string;
  childId?: string;
  unionId: string;
}

export function layoutNetwork(
  network: AncestorNetwork,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): NetworkLayout {
  const nodes = new Map<string, LayoutNode>();
  network.persons.forEach((person) =>
    nodes.set(person.id, {
      id: person.id,
      kind: 'person',
      person,
      layer: personLayer(person),
      order: 0,
      x: 0,
      y: 0,
      width: options.personWidth,
      height: options.personHeight,
    }),
  );
  network.unions.forEach((union) =>
    nodes.set(unionNodeId(union.id), {
      id: unionNodeId(union.id),
      kind: 'union',
      unionId: union.id,
      layer: unionLayer(union, network.persons),
      order: 0,
      x: 0,
      y: 0,
      width: UNION_SIZE,
      height: UNION_SIZE,
    }),
  );

  const raw: RawEdge[] = [];
  network.unions.forEach((union) => {
    union.parents.forEach((parentId) => {
      if (nodes.has(parentId))
        raw.push({
          upper: parentId,
          lower: unionNodeId(union.id),
          parentId,
          unionId: union.id,
        });
    });
    union.children.forEach((childId) => {
      if (nodes.has(childId))
        raw.push({
          upper: unionNodeId(union.id),
          lower: childId,
          childId,
          unionId: union.id,
        });
    });
  });

  // Rows that actually hold something, oldest generation first.
  const occupied = Array.from(
    new Set(Array.from(nodes.values()).map((node) => node.layer)),
  ).sort((a, b) => b - a);
  const rowOf = new Map(occupied.map((layer, index) => [layer, index]));

  // Waypoints, so an edge that skips generations is ordered and drawn like any
  // other pair of neighbours rather than cutting across the rows.
  const edges: Array<{raw: RawEdge; chain: string[]}> = [];
  let waypoints = 0;
  raw.forEach((edge) => {
    const upperRow = rowOf.get(nodes.get(edge.upper)?.layer ?? 0) ?? 0;
    const lowerRow = rowOf.get(nodes.get(edge.lower)?.layer ?? 0) ?? 0;
    const chain: string[] = [];
    for (let row = upperRow + 1; row < lowerRow; row++) {
      const id = `waypoint:${waypoints++}`;
      nodes.set(id, {
        id,
        kind: 'waypoint',
        layer: occupied[row],
        order: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
      chain.push(id);
    }
    edges.push({raw: edge, chain});
  });

  // Adjacency on the layered graph, waypoints included.
  const upperNeighbours = new Map<string, string[]>();
  const lowerNeighbours = new Map<string, string[]>();
  const join = (upper: string, lower: string) => {
    const up = upperNeighbours.get(lower) ?? [];
    up.push(upper);
    upperNeighbours.set(lower, up);
    const down = lowerNeighbours.get(upper) ?? [];
    down.push(lower);
    lowerNeighbours.set(upper, down);
  };
  edges.forEach(({raw: edge, chain}) => {
    const sequence = [edge.upper, ...chain, edge.lower];
    for (let i = 0; i + 1 < sequence.length; i++)
      join(sequence[i], sequence[i + 1]);
  });

  const rows: LayoutNode[][] = occupied.map(() => []);
  nodes.forEach((node) => rows[rowOf.get(node.layer) ?? 0].push(node));
  order(rows, nodes, upperNeighbours, lowerNeighbours, options.sweeps);
  position(rows, upperNeighbours, lowerNeighbours, options);

  const laidOut = Array.from(nodes.values());
  const width =
    Math.max(...laidOut.map((node) => node.x + node.width / 2), 0) +
    options.margin;
  const height =
    Math.max(...laidOut.map((node) => node.y + node.height), 0) +
    options.margin;

  const drawn: LayoutEdge[] = edges.map(({raw: edge, chain}, index) => {
    const upper = nodes.get(edge.upper) as LayoutNode;
    const lower = nodes.get(edge.lower) as LayoutNode;
    const points: Array<[number, number]> = [
      [upper.x, upper.y + upper.height],
      ...chain.map((id) => {
        const node = nodes.get(id) as LayoutNode;
        return [node.x, node.y] as [number, number];
      }),
      [lower.x, lower.y],
    ];
    return {
      id: `edge:${index}`,
      parentId: edge.parentId,
      childId: edge.childId,
      unionId: edge.unionId,
      points,
    };
  });

  const rootNode = nodes.get(network.root);
  return {
    nodes: laidOut,
    edges: drawn,
    byId: nodes,
    width,
    height,
    origin: rootNode
      ? [rootNode.x, rootNode.y + rootNode.height / 2]
      : [width / 2, height / 2],
  };
}

export function unionNodeId(famId: string) {
  return `union:${famId}`;
}

/** Barycentre sweeps, keeping whichever ordering crossed least. */
function order(
  rows: LayoutNode[][],
  nodeById: Map<string, LayoutNode>,
  upperNeighbours: Map<string, string[]>,
  lowerNeighbours: Map<string, string[]>,
  sweeps: number,
) {
  const renumber = () =>
    rows.forEach((row) => row.forEach((node, index) => (node.order = index)));
  renumber();

  let best = rows.map((row) => row.map((node) => node.id));
  let bestCrossings = crossings(rows, lowerNeighbours);

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const downwards = sweep % 2 === 0;
    const sequence = downwards
      ? rows.map((_, index) => index)
      : rows.map((_, index) => rows.length - 1 - index);
    sequence.forEach((index) => {
      const neighbours = downwards ? upperNeighbours : lowerNeighbours;
      const row = rows[index];
      const key = new Map(
        row.map((node) => [node.id, barycentre(node, neighbours, nodeById)]),
      );
      row.sort((a, b) => {
        const ka = key.get(a.id);
        const kb = key.get(b.id);
        if (ka === undefined && kb === undefined) return a.order - b.order;
        if (ka === undefined) return -1;
        if (kb === undefined) return 1;
        return ka - kb || a.order - b.order;
      });
      row.forEach((node, position) => (node.order = position));
    });
    const count = crossings(rows, lowerNeighbours);
    if (count < bestCrossings) {
      bestCrossings = count;
      best = rows.map((row) => row.map((node) => node.id));
    }
  }

  rows.forEach((row, index) => {
    const wanted = new Map(best[index].map((id, position) => [id, position]));
    row.sort((a, b) => (wanted.get(a.id) ?? 0) - (wanted.get(b.id) ?? 0));
    row.forEach((node, position) => (node.order = position));
  });
}

function barycentre(
  node: LayoutNode,
  neighbours: Map<string, string[]>,
  nodeById: Map<string, LayoutNode>,
): number | undefined {
  const ids = neighbours.get(node.id);
  if (!ids || !ids.length) return undefined;
  const orders = ids
    .map((id) => nodeById.get(id)?.order)
    .filter((value): value is number => value !== undefined);
  if (!orders.length) return undefined;
  return orders.reduce((sum, value) => sum + value, 0) / orders.length;
}

function crossings(
  rows: LayoutNode[][],
  lowerNeighbours: Map<string, string[]>,
): number {
  const orderOf = new Map<string, number>();
  rows.forEach((row) =>
    row.forEach((node) => orderOf.set(node.id, node.order)),
  );
  let total = 0;
  for (let index = 0; index + 1 < rows.length; index++) {
    const pairs: Array<[number, number]> = [];
    rows[index].forEach((node) =>
      (lowerNeighbours.get(node.id) ?? []).forEach((id) => {
        const lower = orderOf.get(id);
        if (lower !== undefined) pairs.push([node.order, lower]);
      }),
    );
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++)
        if (pairs[i][1] > pairs[j][1]) total++;
  }
  return total;
}

/**
 * Coordinates: rows get their y from the generation, x comes from repeatedly
 * pulling every node towards the average of what it is joined to and then
 * pushing the row apart again where that made boxes overlap.
 */
function position(
  rows: LayoutNode[][],
  upperNeighbours: Map<string, string[]>,
  lowerNeighbours: Map<string, string[]>,
  options: LayoutOptions,
) {
  let y = options.margin;
  rows.forEach((row) => {
    const height = Math.max(0, ...row.map((node) => node.height));
    row.forEach((node) => (node.y = y + (height - node.height) / 2));
    y += height + options.vGap;
  });

  rows.forEach((row) => {
    let x = options.margin;
    row.forEach((node) => {
      node.x = x + node.width / 2;
      x += node.width + options.hGap;
    });
  });

  const nodeById = new Map<string, LayoutNode>();
  rows.forEach((row) => row.forEach((node) => nodeById.set(node.id, node)));

  for (let pass = 0; pass < 6; pass++) {
    const downwards = pass % 2 === 0;
    const sequence = downwards
      ? rows.map((_, index) => index)
      : rows.map((_, index) => rows.length - 1 - index);
    sequence.forEach((index) => {
      const neighbours = downwards ? upperNeighbours : lowerNeighbours;
      const row = rows[index];
      const wanted = row.map((node) => {
        const ids = neighbours.get(node.id) ?? [];
        const xs = ids
          .map((id) => nodeById.get(id)?.x)
          .filter((value): value is number => value !== undefined);
        return xs.length
          ? xs.reduce((sum, value) => sum + value, 0) / xs.length
          : node.x;
      });
      separate(row, wanted, options);
    });
  }

  const left = Math.min(...rows.flat().map((node) => node.x - node.width / 2));
  const shift = options.margin - left;
  rows.flat().forEach((node) => (node.x += shift));
}

/**
 * Places a row as close to its wanted positions as the boxes allow: one pass
 * pushing right, one pulling left, and the average of the two, which keeps a
 * row centred instead of piled against whichever end was swept first.
 */
function separate(row: LayoutNode[], wanted: number[], options: LayoutOptions) {
  const pushed = wanted.slice();
  for (let i = 1; i < row.length; i++) {
    const minimum =
      pushed[i - 1] + row[i - 1].width / 2 + options.hGap + row[i].width / 2;
    pushed[i] = Math.max(pushed[i], minimum);
  }
  const pulled = wanted.slice();
  for (let i = row.length - 2; i >= 0; i--) {
    const maximum =
      pulled[i + 1] - row[i + 1].width / 2 - options.hGap - row[i].width / 2;
    pulled[i] = Math.min(pulled[i], maximum);
  }
  const merged = row.map((_, i) => (pushed[i] + pulled[i]) / 2);
  for (let i = 1; i < merged.length; i++) {
    const minimum =
      merged[i - 1] + row[i - 1].width / 2 + options.hGap + row[i].width / 2;
    merged[i] = Math.max(merged[i], minimum);
  }
  row.forEach((node, i) => (node.x = merged[i]));
}
