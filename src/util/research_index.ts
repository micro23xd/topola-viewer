/**
 * Two indexes the research panel needs and the evidence model has no reason to
 * hold: which people cite a source, and which places the file names.
 *
 * Both are questions about the file rather than about a person — "have I used
 * the Bieber register anywhere since I got the film numbers?", "how many events
 * did I put in Lämmerspiel?" — and both are cheap enough to recompute per
 * loaded file.
 */

import {GedcomEntry} from 'parse-gedcom';
import {GedcomData, pointerToId} from './gedcom_util';

export interface SourceUse {
  sourceId: string;
  title: string;
  author?: string;
  repoName?: string;
  repoWww?: string;
  notes: string[];
  /** Number of citations, counting each PAGE separately. */
  citations: number;
  /** People citing it, in file order. */
  people: string[];
}

export interface PlaceUse {
  place: string;
  events: number;
  people: string[];
}

interface Indexes {
  sources: SourceUse[];
  places: PlaceUse[];
}

const cache = new WeakMap<GedcomData, Indexes>();

function walk(entry: GedcomEntry, visit: (entry: GedcomEntry) => void) {
  visit(entry);
  entry.tree.forEach((sub) => walk(sub, visit));
}

function textOf(entry: GedcomEntry, tag: string): string | undefined {
  return entry.tree.find((sub) => sub.tag === tag)?.data || undefined;
}

function noteLines(entry: GedcomEntry): string[] {
  const note = entry.tree.find((sub) => sub.tag === 'NOTE');
  if (!note) return [];
  const lines = [note.data ?? ''];
  note.tree.forEach((sub) => {
    if (sub.tag === 'CONT') lines.push(sub.data ?? '');
    else if (sub.tag === 'CONC' && sub.data)
      lines[lines.length - 1] += sub.data;
  });
  return lines;
}

function compute(gedcom: GedcomData): Indexes {
  const uses = new Map<string, {citations: number; people: Set<string>}>();
  const places = new Map<string, {events: number; people: Set<string>}>();

  const spousesOf = (fam: GedcomEntry) =>
    fam.tree
      .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
      .map((entry) => (entry.data ? pointerToId(entry.data) : undefined))
      .filter((id): id is string => !!id);

  const record = (root: GedcomEntry, people: string[]) => {
    walk(root, (entry) => {
      if (entry.tag === 'SOUR' && entry.data?.startsWith('@')) {
        const id = pointerToId(entry.data);
        const use = uses.get(id) ?? {citations: 0, people: new Set<string>()};
        use.citations += 1;
        people.forEach((person) => use.people.add(person));
        uses.set(id, use);
      }
      if (entry.tag === 'PLAC' && entry.data) {
        const place = places.get(entry.data) ?? {
          events: 0,
          people: new Set<string>(),
        };
        place.events += 1;
        people.forEach((person) => place.people.add(person));
        places.set(entry.data, place);
      }
    });
  };

  Object.entries(gedcom.indis).forEach(([id, entry]) => record(entry, [id]));
  Object.values(gedcom.fams).forEach((entry) =>
    record(entry, spousesOf(entry)),
  );

  const sources: SourceUse[] = Object.entries(gedcom.other)
    .filter(([, entry]) => entry.tag === 'SOUR')
    .map(([id, entry]) => {
      const repoReference = entry.tree.find((sub) => sub.tag === 'REPO');
      const repo = repoReference?.data
        ? gedcom.other[pointerToId(repoReference.data)]
        : undefined;
      const use = uses.get(id);
      return {
        sourceId: id,
        title: textOf(entry, 'TITL') ?? textOf(entry, 'ABBR') ?? id,
        author: textOf(entry, 'AUTH'),
        repoName: repo ? textOf(repo, 'NAME') : undefined,
        repoWww: repo ? textOf(repo, 'WWW') : undefined,
        notes: noteLines(entry),
        citations: use?.citations ?? 0,
        people: use ? Array.from(use.people) : [],
      };
    })
    .sort(
      (a, b) => b.citations - a.citations || a.title.localeCompare(b.title),
    );

  const placeList: PlaceUse[] = Array.from(places.entries())
    .map(([place, use]) => ({
      place,
      events: use.events,
      people: Array.from(use.people),
    }))
    .sort((a, b) => b.events - a.events || a.place.localeCompare(b.place));

  return {sources, places: placeList};
}

export function researchIndexes(gedcom: GedcomData): Indexes {
  const cached = cache.get(gedcom);
  if (cached) return cached;
  const computed = compute(gedcom);
  cache.set(gedcom, computed);
  return computed;
}

/** Everyone above this person, the person included. */
export function ancestorsOf(gedcom: GedcomData, indi: string): Set<string> {
  const found = new Set<string>();
  const stack = [indi];
  while (stack.length) {
    const id = stack.pop() as string;
    if (found.has(id) || !gedcom.indis[id]) continue;
    found.add(id);
    gedcom.indis[id].tree
      .filter((entry) => entry.tag === 'FAMC' && entry.data)
      .map((entry) => gedcom.fams[pointerToId(entry.data as string)])
      .filter((fam): fam is GedcomEntry => !!fam)
      .forEach((fam) =>
        fam.tree
          .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
          .forEach((entry) => {
            if (entry.data) stack.push(pointerToId(entry.data));
          }),
      );
  }
  return found;
}
