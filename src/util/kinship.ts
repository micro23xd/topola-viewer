/**
 * How are these two people related?
 *
 * The Ahnennetz shows that this tree is a web rather than a chain; it cannot
 * say what the web *means* for a given pair. That is this module: given two
 * ids, find every common ancestor, reduce them to the most recent ones, and
 * hand back enough structure for the panel to name the relationship and print
 * both lines of descent.
 *
 * Three decisions worth knowing before reading the code.
 *
 * **It works on the raw GEDCOM, not on topola's JSON.** The JSON model gives a
 * person a single `famc`, and this file has people with more than one; it also
 * drops `PEDI`, and one link here is `PEDI adopted` and must not be passed off
 * as a blood link. `ancestorsOf` in `research_index.ts` reads the raw tree for
 * the same reason.
 *
 * **It reduces to most-recent common ancestors.** In the tree this was written
 * for, one married couple share seventy ancestors, which is a true and useless
 * statement; nine of those are most recent, and that is the answer. A grandson
 * and his own grandfather share two hundred and thirteen, of which exactly one
 * is most recent — "your grandfather". Everything counted here counts MRCAs.
 *
 * **It enumerates paths exhaustively.** The deepest person in the file is
 * reached by 546 distinct paths and the whole enumeration costs about a
 * millisecond, so there is no reason to approximate. The guards below exist for
 * files that are not this one.
 */

import {GedcomEntry} from 'parse-gedcom';
import {GedcomData, pointerToId} from './gedcom_util';

/** One step up a line: who was reached, through which family, and how. */
export interface Step {
  id: string;
  famId: string;
  /** The child was entered on this family with `PEDI adopted`. */
  adopted: boolean;
}

/** A line of descent, read upwards. The last step names the ancestor. */
export interface Path {
  steps: Step[];
}

export interface CommonAncestor {
  id: string;
  /** Shortest line from A, and from B. */
  fromA: Path;
  fromB: Path;
  /** Generations up from A, and from B. */
  up: [number, number];
  /** Set when both sides descend through the *same* family: a shared couple. */
  throughFam?: string;
  /** The other parent on that family, when there is one. */
  partner?: string;
  /** Lines of descent reaching this ancestor: paths from A × paths from B. */
  lines: number;
  /** Any step on either line is an adoption. */
  adopted: boolean;
}

export type Kind =
  | 'same'
  | 'ancestor' // A is above B
  | 'descendant' // A is below B
  | 'sibling'
  | 'avuncular' // A is B's uncle or aunt, at some remove
  | 'nibling' // A is B's nephew or niece
  | 'cousin'
  | 'affinal' // no blood link, but one marriage joins them
  | 'chain' // joined only by a chain of marriages
  | 'none'; // the file records no connection at all

/** One hop of a bridge: how the next person was reached from the last. */
export interface Hop {
  id: string;
  via: 'parent' | 'child' | 'spouse';
  famId: string;
}

export interface Kinship {
  a: string;
  b: string;
  kind: Kind;
  /** min(upA, upB) — 0 direct line, 1 siblings or avuncular, ≥2 cousins. */
  degree: number;
  /** |upA − upB|. */
  removal: number;
  /** Shared through one ancestor rather than through a couple. */
  half: boolean;
  /** A and B are also married to each other. */
  married: boolean;
  best?: CommonAncestor;
  /** The remaining MRCAs, closest first. */
  others: CommonAncestor[];
  /** Number of most-recent common ancestors. */
  mrcas: number;
  /** Lines of descent summed over all MRCAs. */
  lines: number;
  /** For `affinal` and `chain`: the labelled hops from A to B. */
  bridge?: Hop[];
  /** Lowest QUAY among the marriages of the couples on `best`'s two lines. */
  weakest?: number;
  /** Couples on those lines whose marriage carries no citation at all. */
  uncited: number;
  /** Steps on those lines, both sides together. */
  steps: number;
  /** A guard tripped: what is reported is a floor, not the whole answer. */
  partial: boolean;
}

export interface Limits {
  maxDepth: number;
  maxPaths: number;
}

export const DEFAULT_LIMITS: Limits = {maxDepth: 40, maxPaths: 50_000};

function pointers(entry: GedcomEntry | undefined, tag: string): string[] {
  return (entry?.tree ?? [])
    .filter((sub) => sub.tag === tag && sub.data)
    .map((sub) => pointerToId(sub.data as string));
}

/**
 * Was this child entered on this family as adopted? GEDCOM allows `PEDI` on
 * either end of the link, so both are read.
 */
function isAdopted(
  gedcom: GedcomData,
  childId: string,
  famId: string,
): boolean {
  const onFam = (gedcom.fams[famId]?.tree ?? []).find(
    (sub) =>
      sub.tag === 'CHIL' && sub.data && pointerToId(sub.data) === childId,
  );
  const onIndi = (gedcom.indis[childId]?.tree ?? []).find(
    (sub) => sub.tag === 'FAMC' && sub.data && pointerToId(sub.data) === famId,
  );
  const pedi = (entry?: GedcomEntry) =>
    entry?.tree.find((sub) => sub.tag === 'PEDI')?.data;
  return pedi(onFam) === 'adopted' || pedi(onIndi) === 'adopted';
}

/** The parents of a person, each with the family the link runs through. */
function parentsOf(gedcom: GedcomData, id: string): Step[] {
  const steps: Step[] = [];
  pointers(gedcom.indis[id], 'FAMC').forEach((famId) => {
    const fam = gedcom.fams[famId];
    if (!fam) return;
    const adopted = isAdopted(gedcom, id, famId);
    fam.tree
      .filter((sub) => (sub.tag === 'HUSB' || sub.tag === 'WIFE') && sub.data)
      .forEach((sub) => {
        const parent = pointerToId(sub.data as string);
        if (gedcom.indis[parent]) steps.push({id: parent, famId, adopted});
      });
  });
  return steps;
}

/** The children of a person, each with the family the link runs through. */
function childrenOf(gedcom: GedcomData, id: string): Step[] {
  const steps: Step[] = [];
  pointers(gedcom.indis[id], 'FAMS').forEach((famId) => {
    pointers(gedcom.fams[famId], 'CHIL').forEach((child) => {
      if (gedcom.indis[child])
        steps.push({
          id: child,
          famId,
          adopted: isAdopted(gedcom, child, famId),
        });
    });
  });
  return steps;
}

/** The spouses of a person, each with their family. */
function spousesOf(gedcom: GedcomData, id: string): Step[] {
  const steps: Step[] = [];
  pointers(gedcom.indis[id], 'FAMS').forEach((famId) => {
    (gedcom.fams[famId]?.tree ?? [])
      .filter((sub) => (sub.tag === 'HUSB' || sub.tag === 'WIFE') && sub.data)
      .forEach((sub) => {
        const spouse = pointerToId(sub.data as string);
        if (spouse !== id && gedcom.indis[spouse])
          steps.push({id: spouse, famId, adopted: false});
      });
  });
  return steps;
}

interface PathIndex {
  paths: Map<string, Path[]>;
  partial: boolean;
}

const pathCache = new WeakMap<GedcomData, Map<string, PathIndex>>();

/**
 * Every line of descent from `id` upwards, keyed by the ancestor it reaches.
 * The person themselves is in the map with one empty path, which is what makes
 * "A is B's ancestor" fall out of the same intersection as everything else.
 *
 * Memoised per file and per person: the relations tab recomputes on every
 * click, because the person it compares from is the live selection.
 */
export function ancestorPaths(
  gedcom: GedcomData,
  id: string,
  limits: Limits = DEFAULT_LIMITS,
): Map<string, Path[]> {
  return ancestorPathIndex(gedcom, id, limits).paths;
}

function ancestorPathIndex(
  gedcom: GedcomData,
  id: string,
  limits: Limits,
): PathIndex {
  let perFile = pathCache.get(gedcom);
  if (!perFile) {
    perFile = new Map();
    pathCache.set(gedcom, perFile);
  }
  const cached = perFile.get(id);
  if (cached && limits === DEFAULT_LIMITS) return cached;

  const paths = new Map<string, Path[]>();
  let count = 0;
  let partial = false;
  if (gedcom.indis[id]) {
    paths.set(id, [{steps: []}]);
    const onPath = new Set<string>([id]);
    const steps: Step[] = [];
    const walk = (person: string) => {
      if (steps.length >= limits.maxDepth) {
        partial = true;
        return;
      }
      parentsOf(gedcom, person).forEach((step) => {
        // The same guard `buildAncestorNetwork` uses: a person may be reached
        // twice by different lines, but never twice on one line.
        if (onPath.has(step.id)) return;
        if (count >= limits.maxPaths) {
          partial = true;
          return;
        }
        onPath.add(step.id);
        steps.push(step);
        const found = paths.get(step.id);
        const path = {steps: steps.slice()};
        if (found) found.push(path);
        else paths.set(step.id, [path]);
        count++;
        walk(step.id);
        steps.pop();
        onPath.delete(step.id);
      });
    };
    walk(id);
  }

  const index = {paths, partial};
  if (limits === DEFAULT_LIMITS) perFile.set(id, index);
  return index;
}

function shortest(paths: Path[]): Path {
  return paths.reduce((best, p) =>
    p.steps.length < best.steps.length ? p : best,
  );
}

/** The year in a `BIRT`/`CHR` date, for a stable tie-break. */
function birthYear(gedcom: GedcomData, id: string): number | undefined {
  const record = gedcom.indis[id];
  if (!record) return undefined;
  const event =
    record.tree.find((sub) => sub.tag === 'BIRT') ??
    record.tree.find((sub) => sub.tag === 'CHR');
  const date = event?.tree.find((sub) => sub.tag === 'DATE')?.data;
  const year = date?.match(/\d{3,4}/);
  return year ? Number(year[0]) : undefined;
}

/**
 * The evidence on one step of a line.
 *
 * A parent-child link almost never carries a citation of its own — GEDCOM has
 * nowhere obvious to put one, and this file uses `SOUR` on a `FAMC` twice in
 * fifteen thousand lines. The first version of this function fell back on the
 * child's own birth entry, and every line in the file came out at tier 0,
 * because a living person's birth is family knowledge: a number that fires on
 * everything says nothing.
 *
 * What *is* recorded, family by family, is the marriage. So a step is scored by
 * the marriage of the family it runs through, and a family that records no
 * marriage citation is counted rather than scored. The panel then says how many
 * of the couples on this line are documented and how many are not, which is a
 * research statement the file can actually support.
 */
function stepMarriageTier(
  gedcom: GedcomData,
  famId: string,
): number | undefined {
  const quays = (gedcom.fams[famId]?.tree ?? [])
    .filter((sub) => sub.tag === 'MARR')
    .flatMap((marr) => marr.tree.filter((sub) => sub.tag === 'SOUR'))
    .map((sour) => {
      const text = sour.tree.find((sub) => sub.tag === 'QUAY')?.data;
      return text !== undefined ? Number(text) : NaN;
    })
    .filter((quay) => Number.isFinite(quay));
  return quays.length ? Math.max(...quays) : undefined;
}

/** How well documented the couples on both lines of descent are. */
function lineEvidence(
  gedcom: GedcomData,
  ancestor: CommonAncestor,
): {weakest?: number; uncited: number; steps: number} {
  const fams = [...ancestor.fromA.steps, ...ancestor.fromB.steps].map(
    (step) => step.famId,
  );
  const tiers = fams
    .map((famId) => stepMarriageTier(gedcom, famId))
    .filter((tier): tier is number => tier !== undefined);
  return {
    weakest: tiers.length ? Math.min(...tiers) : undefined,
    uncited: fams.length - tiers.length,
    steps: fams.length,
  };
}

function marriedTo(gedcom: GedcomData, a: string, b: string): boolean {
  return pointers(gedcom.indis[a], 'FAMS').some((famId) =>
    pointers(gedcom.indis[b], 'FAMS').includes(famId),
  );
}

/** Names the shape from the two distances. */
function kindOf(upA: number, upB: number): Kind {
  if (upA === 0) return 'ancestor';
  if (upB === 0) return 'descendant';
  if (upA === 1 && upB === 1) return 'sibling';
  if (upA === 1) return 'avuncular';
  if (upB === 1) return 'nibling';
  return 'cousin';
}

function neighbours(gedcom: GedcomData, id: string): Hop[] {
  return [
    ...parentsOf(gedcom, id).map(
      (s): Hop => ({id: s.id, via: 'parent', famId: s.famId}),
    ),
    ...childrenOf(gedcom, id).map(
      (s): Hop => ({id: s.id, via: 'child', famId: s.famId}),
    ),
    ...spousesOf(gedcom, id).map(
      (s): Hop => ({id: s.id, via: 'spouse', famId: s.famId}),
    ),
  ];
}

/**
 * A labelled walk from A to B over parent, child and spouse edges, for the
 * pairs with no common ancestor. Breadth-first, so the bridge is the shortest
 * one; the hop kinds are what let the panel say "her husband's grandfather"
 * rather than printing four names in a row.
 */
function findBridge(
  gedcom: GedcomData,
  a: string,
  b: string,
): Hop[] | undefined {
  const reached = new Map<string, {from: string; hop: Hop}>();
  const seen = new Set<string>([a]);
  let frontier = [a];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const hop of neighbours(gedcom, id)) {
        if (seen.has(hop.id)) continue;
        seen.add(hop.id);
        reached.set(hop.id, {from: id, hop});
        if (hop.id === b) {
          const bridge: Hop[] = [];
          let at = b;
          while (at !== a) {
            const step = reached.get(at);
            if (!step) return undefined;
            bridge.unshift(step.hop);
            at = step.from;
          }
          return bridge;
        }
        next.push(hop.id);
      }
    }
    frontier = next;
  }
  return undefined;
}

function otherSpouse(
  gedcom: GedcomData,
  famId: string,
  notThis: string,
): string | undefined {
  return (gedcom.fams[famId]?.tree ?? [])
    .filter((sub) => (sub.tag === 'HUSB' || sub.tag === 'WIFE') && sub.data)
    .map((sub) => pointerToId(sub.data as string))
    .find((id) => id !== notThis);
}

/** The family the last step of a line ran through, if there is a last step. */
function throughFamOf(path: Path): string | undefined {
  return path.steps.length
    ? path.steps[path.steps.length - 1].famId
    : undefined;
}

/**
 * Builds the record for one common ancestor.
 *
 * Half or full is decided here, and it is decided over *all* the lines rather
 * than over the two shortest: if any line from A and any line from B descend
 * through the same family, the couple is shared and the relationship is full,
 * even when some other pair of lines is not. Where a shared family exists the
 * shortest lines through it are the ones reported, so the panel prints the
 * lines its own verdict rests on.
 */
function describeAncestor(
  gedcom: GedcomData,
  id: string,
  fromA: Path[],
  fromB: Path[],
): CommonAncestor {
  const famsA = new Set(
    fromA.map(throughFamOf).filter((f): f is string => !!f),
  );
  const shared = fromB
    .map(throughFamOf)
    .find((famId): famId is string => !!famId && famsA.has(famId));

  const pickA = shared
    ? fromA.filter((p) => throughFamOf(p) === shared)
    : fromA;
  const pickB = shared
    ? fromB.filter((p) => throughFamOf(p) === shared)
    : fromB;
  const bestA = shortest(pickA);
  const bestB = shortest(pickB);

  return {
    id,
    fromA: bestA,
    fromB: bestB,
    up: [bestA.steps.length, bestB.steps.length],
    throughFam: shared,
    partner: shared ? otherSpouse(gedcom, shared, id) : undefined,
    lines: fromA.length * fromB.length,
    adopted: [...bestA.steps, ...bestB.steps].some((step) => step.adopted),
  };
}

/**
 * How A relates to B.
 *
 * The order of the tests matters: everything short-circuits on the first one
 * that holds, so a blood relation is always reported as one even when the pair
 * are also married — which in this file happens more than once, and is the
 * whole reason the four pedigree collapses exist.
 */
export function kinship(
  gedcom: GedcomData,
  a: string,
  b: string,
  limits: Limits = DEFAULT_LIMITS,
): Kinship {
  const married = marriedTo(gedcom, a, b);
  const empty: Kinship = {
    a,
    b,
    kind: 'none',
    degree: 0,
    removal: 0,
    half: false,
    married,
    others: [],
    mrcas: 0,
    lines: 0,
    uncited: 0,
    steps: 0,
    partial: false,
  };

  if (!gedcom.indis[a] || !gedcom.indis[b]) return empty;
  if (a === b) return {...empty, kind: 'same'};

  const indexA = ancestorPathIndex(gedcom, a, limits);
  const indexB = ancestorPathIndex(gedcom, b, limits);
  const partial = indexA.partial || indexB.partial;

  const common = new Set<string>();
  indexA.paths.forEach((_, id) => {
    if (indexB.paths.has(id)) common.add(id);
  });

  // Most recent: a common ancestor none of whose children is also one.
  const mrcaIds = Array.from(common).filter(
    (id) => !childrenOf(gedcom, id).some((child) => common.has(child.id)),
  );

  if (!mrcaIds.length) {
    const bridge = findBridge(gedcom, a, b);
    if (!bridge) return {...empty, partial};
    const marriages = bridge.filter((hop) => hop.via === 'spouse').length;
    return {
      ...empty,
      kind: marriages === 1 ? 'affinal' : 'chain',
      bridge,
      partial,
    };
  }

  const ancestors = mrcaIds
    .map((id) =>
      describeAncestor(
        gedcom,
        id,
        indexA.paths.get(id) as Path[],
        indexB.paths.get(id) as Path[],
      ),
    )
    .sort((x, y) => {
      const distance = x.up[0] + x.up[1] - (y.up[0] + y.up[1]);
      if (distance) return distance;
      const yearX = birthYear(gedcom, x.id);
      const yearY = birthYear(gedcom, y.id);
      if (yearX !== yearY) {
        if (yearX === undefined) return 1;
        if (yearY === undefined) return -1;
        return yearX - yearY;
      }
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
    });

  const best = ancestors[0];
  const [upA, upB] = best.up;
  return {
    a,
    b,
    kind: kindOf(upA, upB),
    degree: Math.min(upA, upB),
    removal: Math.abs(upA - upB),
    // Half only means anything where both sides descend: a direct ancestor is
    // neither half nor full.
    half: upA > 0 && upB > 0 && !best.throughFam,
    married,
    best,
    others: ancestors.slice(1),
    mrcas: ancestors.length,
    lines: ancestors.reduce((sum, one) => sum + one.lines, 0),
    ...lineEvidence(gedcom, best),
    partial,
  };
}
