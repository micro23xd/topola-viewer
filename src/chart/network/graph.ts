/**
 * The ancestry as a graph instead of a tree.
 *
 * Every chart in this viewer is a d3 tree layout, and a tree gives each node
 * exactly one parent slot. An ancestor reachable by two different lines of
 * descent therefore has to be drawn twice — topola even ships an `IdGenerator`
 * whose job is to mint a second identifier for the second copy. On a tree with
 * documented pedigree collapse that is not a rendering detail: one real tree
 * needs 368 boxes for 261 people, and the man responsible for the largest
 * share of the inflation appears five times without any of the five saying so.
 *
 * This module builds the other thing: the bipartite person/union graph that
 * `tools/gedcom2dot.py` draws, restricted to the ancestors of one person, with
 * each individual appearing exactly once. It also counts what the tree layout
 * would have done — `paths` per person — because "how many ways do I descend
 * from this man" is the genealogically interesting number, and it is the
 * number that makes the duplication legible rather than confusing.
 *
 * Pure data, no d3 and no DOM: `layout.ts` turns this into coordinates.
 */

import {JsonFam, JsonGedcomData, JsonIndi} from 'topola';

export interface NetworkPerson {
  id: string;
  /**
   * Generations above the root, counted along the *longest* route.
   *
   * The longest route rather than the shortest because a person must be drawn
   * above every one of their descendants, and pedigree collapse means the same
   * ancestor can be four generations up one line and six up another.
   */
  rank: number;
  /** Distinct lines of descent from this person down to the root. */
  paths: number;
  /** Families in the network where this person is a parent. */
  unions: string[];
  /** Families in the network where this person is a child. */
  origins: string[];
}

export interface NetworkUnion {
  id: string;
  /** Parents present in the network, husband first. */
  parents: string[];
  /** Children present in the network, i.e. the ancestors descending through it. */
  children: string[];
}

export interface AncestorNetwork {
  root: string;
  persons: Map<string, NetworkPerson>;
  unions: Map<string, NetworkUnion>;
  /** Everyone a pedigree chart would draw more than once, most repeated first. */
  repeated: NetworkPerson[];
  /** Boxes a pedigree chart would need for the same people. */
  pedigreeBoxes: number;
}

const EMPTY: AncestorNetwork = {
  root: '',
  persons: new Map(),
  unions: new Map(),
  repeated: [],
  pedigreeBoxes: 0,
};

/** Person layers are even, the union between two generations sits on the odd one. */
export function personLayer(person: NetworkPerson) {
  return person.rank * 2;
}

export function unionLayer(
  union: NetworkUnion,
  persons: Map<string, NetworkPerson>,
) {
  const childRanks = union.children.map((id) => persons.get(id)?.rank ?? 0);
  return Math.max(0, ...childRanks) * 2 + 1;
}

function famcOf(indi: JsonIndi): string[] {
  return indi.famc ? [indi.famc] : [];
}

function parentsOf(fam: JsonFam): string[] {
  return [fam.husb, fam.wife].filter((id): id is string => !!id);
}

/**
 * Collects the ancestors of `root` and the families joining them.
 *
 * Cycles cannot occur in real data but do occur in broken files, and a cycle
 * here would hang the ranking below, so an edge that would close one is
 * dropped rather than trusted.
 */
export function buildAncestorNetwork(
  data: JsonGedcomData,
  root: string,
): AncestorNetwork {
  const indis = new Map(data.indis.map((indi) => [indi.id, indi]));
  const fams = new Map(data.fams.map((fam) => [fam.id, fam]));
  if (!indis.has(root)) return {...EMPTY, root};

  const persons = new Map<string, NetworkPerson>();
  const unions = new Map<string, NetworkUnion>();
  const onPath = new Set<string>();

  const walk = (id: string) => {
    if (persons.has(id)) return;
    const person: NetworkPerson = {
      id,
      rank: 0,
      paths: 0,
      unions: [],
      origins: [],
    };
    persons.set(id, person);
    onPath.add(id);

    const indi = indis.get(id);
    famcOf(indi as JsonIndi).forEach((famId) => {
      const fam = fams.get(famId);
      if (!fam) return;
      const parents = parentsOf(fam).filter(
        (parentId) => indis.has(parentId) && !onPath.has(parentId),
      );
      if (!parents.length) return;

      const union = unions.get(famId) ?? {id: famId, parents: [], children: []};
      unions.set(famId, union);
      union.children.push(id);
      person.origins.push(famId);
      parents.forEach((parentId) => {
        if (!union.parents.includes(parentId)) union.parents.push(parentId);
        walk(parentId);
        const parent = persons.get(parentId);
        if (parent && !parent.unions.includes(famId)) parent.unions.push(famId);
      });
    });

    onPath.delete(id);
  };
  walk(root);

  rank(persons, unions, root);

  const repeated = Array.from(persons.values())
    .filter((person) => person.paths > 1)
    .sort((a, b) => b.paths - a.paths || a.id.localeCompare(b.id));
  const pedigreeBoxes = Array.from(persons.values()).reduce(
    (total, person) => total + person.paths,
    0,
  );
  return {root, persons, unions, repeated, pedigreeBoxes};
}

/**
 * Longest-path ranks and path counts, both in one topological sweep from the
 * root upwards.
 */
function rank(
  persons: Map<string, NetworkPerson>,
  unions: Map<string, NetworkUnion>,
  root: string,
) {
  const parentsOfPerson = new Map<string, string[]>();
  const childCount = new Map<string, number>();
  persons.forEach((_, id) => {
    parentsOfPerson.set(id, []);
    childCount.set(id, 0);
  });
  persons.forEach((person) => {
    person.origins.forEach((famId) => {
      (unions.get(famId)?.parents ?? []).forEach((parentId) => {
        parentsOfPerson.get(person.id)?.push(parentId);
        childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
      });
    });
  });

  const rootPerson = persons.get(root);
  if (rootPerson) rootPerson.paths = 1;

  const queue = Array.from(persons.keys()).filter(
    (id) => (childCount.get(id) ?? 0) === 0,
  );
  const remaining = new Map(childCount);
  while (queue.length) {
    const id = queue.shift() as string;
    const person = persons.get(id);
    if (!person) continue;
    (parentsOfPerson.get(id) ?? []).forEach((parentId) => {
      const parent = persons.get(parentId);
      if (!parent) return;
      parent.rank = Math.max(parent.rank, person.rank + 1);
      parent.paths += person.paths;
      const left = (remaining.get(parentId) ?? 0) - 1;
      remaining.set(parentId, left);
      if (left === 0) queue.push(parentId);
    });
  }
}

/**
 * The families every one of whose people is already proven.
 *
 * "Fade what is settled" has to mean the fabric and not only the boxes: a union
 * whose couple and children are all evidenced, and the lines running into it,
 * belong to the part of the chart there is nothing left to do about. Anything
 * touching an open question stays visible, so a person who still needs work
 * keeps a thread to where they sit.
 */
export function settledUnions(
  network: AncestorNetwork,
  isSettled: (personId: string) => boolean,
): Set<string> {
  const settled = new Set<string>();
  network.unions.forEach((union, famId) => {
    const people = [...union.parents, ...union.children];
    if (people.every((id) => isSettled(id))) settled.add(famId);
  });
  return settled;
}

/**
 * Everything above this person: their own ancestry, and nothing else.
 *
 * Deliberately never walks a union's *children*. With pedigree collapse a
 * sibling can be an ancestor of the root by some other line, but they are still
 * not an ancestor of this person, and lighting up their branch would say that
 * they were.
 */
export function ancestorCone(network: AncestorNetwork, personId: string) {
  const people = new Set<string>();
  const familyUnions = new Set<string>();
  const stack = [personId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (people.has(id)) continue;
    people.add(id);
    (network.persons.get(id)?.origins ?? []).forEach((famId) => {
      familyUnions.add(famId);
      (network.unions.get(famId)?.parents ?? []).forEach((parent) =>
        stack.push(parent),
      );
    });
  }
  return {people, unions: familyUnions};
}

/**
 * The whole line running through one person — their ancestry above, their
 * descent to the root below — and the people who married into it.
 *
 * The partners matter because of how the highlight reads: at every union on the
 * line exactly one parent carries the descent, and drawing the other one as
 * faded while the line still runs out of their box says they are both connected
 * and not. They are on the chart for a reason; they are just not blood.
 */
export function lineThrough(network: AncestorNetwork, personId: string) {
  const up = ancestorCone(network, personId);
  const down = descentCone(network, personId);
  const blood = new Set([...up.people, ...down.people]);
  const unions = new Set([...up.unions, ...down.unions]);
  const partners = new Set<string>();
  unions.forEach((famId) =>
    (network.unions.get(famId)?.parents ?? []).forEach((parent) => {
      if (!blood.has(parent)) partners.add(parent);
    }),
  );
  return {blood, partners, unions};
}

/**
 * Everything between this person and the root: the lines of descent that put
 * them on the chart in the first place.
 */
export function descentCone(network: AncestorNetwork, personId: string) {
  const people = new Set<string>();
  const familyUnions = new Set<string>();
  const stack = [personId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (people.has(id)) continue;
    people.add(id);
    (network.persons.get(id)?.unions ?? []).forEach((famId) => {
      familyUnions.add(famId);
      (network.unions.get(famId)?.children ?? []).forEach((child) =>
        stack.push(child),
      );
    });
  }
  return {people, unions: familyUnions};
}
