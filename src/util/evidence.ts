/**
 * How well is each fact evidenced, and where does the research still have to
 * continue?
 *
 * This is a port of two scripts that live next to the GEDCOM this viewer was
 * written for (`tools/validate.py` and `tools/gedcom2dot.py` in the family-tree
 * repository). Their vocabulary is the point: a fact is an event that asserts a
 * date or a place, its quality is the best QUAY among its citations, and
 * "frontier" means an ancestor whose parents are unknown. The three views —
 * command line, Graphviz chart, viewer — have to agree, so the rules are
 * reproduced here exactly rather than approximated.
 *
 * Everything here is pure: input is the parsed GEDCOM, output is an index.
 */

import {GedcomEntry} from 'parse-gedcom';
import {GedcomData, pointerToId} from './gedcom_util';

/** Events that assert something checkable, and so need a source. */
export const FACT_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI', 'MARR'] as const;
export type FactTag = (typeof FACT_TAGS)[number];

/**
 * The Bieber Ortsforschung is trusted, but the copy of it in this tree lost its
 * per-fact references. A citation to it without a PAGE is complete evidence
 * with an incomplete reference, which is its own work queue.
 */
export const PENDING_SOURCE = 'S_MH_JAEGER';

/**
 * Evidence buckets, in the wording `validate.py` prints.
 * `keine` is not a bucket of facts but a state of a person: nothing asserted.
 */
export type Bucket = 'urkunde' | 'zweitzeuge' | 'hinweis' | 'ohne' | 'keine';

/** Worst first — the order in which a person's state is decided. */
const BUCKET_ORDER: Bucket[] = [
  'ohne',
  'hinweis',
  'zweitzeuge',
  'urkunde',
  'keine',
];

export interface Citation {
  /** Source id without the pointer braces, e.g. `S_KB_BIEBER`. */
  sourceId: string;
  page?: string;
  /** Parsed QUAY; undefined when absent or not a number. */
  quay?: number;
  /** The citation's own NOTE, as lines. */
  notes: string[];
}

export interface Fact {
  /** Id of the INDI or FAM record carrying the fact. */
  owner: string;
  ownerIsFam: boolean;
  tag: FactTag;
  date?: string;
  place?: string;
  citations: Citation[];
  bucket: Exclude<Bucket, 'keine'>;
  /** Best (highest) numeric QUAY among the citations. */
  bestQuay?: number;
  /** QUAY ≤ 1 and the record carries no NOTE explaining why. */
  unexplained: boolean;
  /** Cites the Ortsforschung without its underlying reference. */
  pending: boolean;
}

export interface PersonEvidence {
  id: string;
  /** The person's own facts, in file order. */
  facts: Fact[];
  /** Worst bucket over own facts plus the marriages of their families. */
  state: Bucket;
  /** Parents unknown — this is where research continues. */
  frontier: boolean;
  /** Not connected to the main tree. */
  detached: boolean;
  /** BIRT, else CHR. */
  birthLike?: Fact;
  /** DEAT, else BURI. */
  deathLike?: Fact;
  /** MARR facts of the families where this person is a spouse. */
  marriages: Fact[];
}

export interface Summary {
  facts: number;
  urkunde: number;
  zweitzeuge: number;
  hinweis: number;
  ohne: number;
}

export interface Queues {
  /** Facts asserting a date or place with no citation at all. */
  ohne: Fact[];
  /** Facts resting on a compiled tree or family memory (QUAY 0–1). */
  hinweis: Fact[];
  /** Of those, the ones whose record carries no explanatory NOTE. */
  unexplained: Fact[];
  /** Facts from the Ortsforschung still missing their reference. */
  pending: Fact[];
  /** Person ids whose parents are unknown. */
  frontier: string[];
  /** Person ids not reachable from the main tree. */
  detached: string[];
}

export interface EvidenceIndex {
  persons: Map<string, PersonEvidence>;
  /** Facts per FAM record (in practice the marriage). */
  families: Map<string, Fact[]>;
  summary: Summary;
  queues: Queues;
}

function firstData(entry: GedcomEntry, tag: string): string | undefined {
  return entry.tree.find((sub) => sub.tag === tag)?.data || undefined;
}

/** Joins an entry's data with its CONT/CONC continuations, as lines. */
function noteLines(entry: GedcomEntry): string[] {
  const lines = [entry.data ?? ''];
  entry.tree.forEach((sub) => {
    if (sub.tag === 'CONC' && sub.data) {
      lines[lines.length - 1] += sub.data;
    } else if (sub.tag === 'CONT') {
      lines.push(sub.data ?? '');
    }
  });
  return lines;
}

function citationsOf(event: GedcomEntry): Citation[] {
  return event.tree
    .filter((sub) => sub.tag === 'SOUR')
    .map((sour) => {
      const quayText = firstData(sour, 'QUAY');
      const quay = quayText !== undefined ? Number(quayText) : NaN;
      const note = sour.tree.find((sub) => sub.tag === 'NOTE');
      return {
        sourceId: sour.data ? pointerToId(sour.data) : '',
        page: firstData(sour, 'PAGE'),
        quay: Number.isFinite(quay) ? quay : undefined,
        notes: note ? noteLines(note) : [],
      };
    });
}

function bucketFor(citations: Citation[]): {
  bucket: Exclude<Bucket, 'keine'>;
  bestQuay?: number;
} {
  if (!citations.length) {
    return {bucket: 'ohne'};
  }
  const quays = citations
    .map((c) => c.quay)
    .filter((q): q is number => q !== undefined);
  const bestQuay = quays.length ? Math.max(...quays) : undefined;
  if (bestQuay === 3) return {bucket: 'urkunde', bestQuay};
  if (bestQuay === 2) return {bucket: 'zweitzeuge', bestQuay};
  return {bucket: 'hinweis', bestQuay};
}

/** A fact is an event of a fact tag that asserts a DATE or a PLAC. */
function factsOf(record: GedcomEntry, ownerIsFam: boolean): Fact[] {
  const owner = pointerToId(record.pointer);
  const hasNote = record.tree.some((sub) => sub.tag === 'NOTE');
  const out: Fact[] = [];
  record.tree.forEach((event) => {
    if (!(FACT_TAGS as readonly string[]).includes(event.tag)) return;
    const date = firstData(event, 'DATE');
    const place = firstData(event, 'PLAC');
    if (date === undefined && place === undefined) return;
    const citations = citationsOf(event);
    const {bucket, bestQuay} = bucketFor(citations);
    out.push({
      owner,
      ownerIsFam,
      tag: event.tag as FactTag,
      date,
      place,
      citations,
      bucket,
      bestQuay,
      unexplained: bestQuay !== undefined && bestQuay <= 1 && !hasNote,
      pending: citations.some((c) => c.sourceId === PENDING_SOURCE && !c.page),
    });
  });
  return out;
}

function pointers(record: GedcomEntry, tag: string): string[] {
  return record.tree
    .filter((sub) => sub.tag === tag && sub.data)
    .map((sub) => pointerToId(sub.data as string));
}

/** Worse of two buckets; `keine` loses against everything. */
function worse(a: Bucket, b: Bucket): Bucket {
  return BUCKET_ORDER.indexOf(a) <= BUCKET_ORDER.indexOf(b) ? a : b;
}

function computeUncached(gedcom: GedcomData): EvidenceIndex {
  const famSpouses = new Map<string, string[]>();
  const famChildren = new Map<string, string[]>();
  const families = new Map<string, Fact[]>();

  Object.entries(gedcom.fams).forEach(([id, record]) => {
    const spouses = [...pointers(record, 'HUSB'), ...pointers(record, 'WIFE')];
    famSpouses.set(id, spouses);
    famChildren.set(id, pointers(record, 'CHIL'));
    families.set(id, factsOf(record, true));
  });

  // Marriages reachable from a person, for their state and their dots row.
  const marriagesOf = new Map<string, Fact[]>();
  Object.entries(gedcom.indis).forEach(([id, record]) => {
    const own: Fact[] = [];
    pointers(record, 'FAMS').forEach((famId) => {
      (families.get(famId) ?? [])
        .filter((f) => f.tag === 'MARR')
        .forEach((f) => own.push(f));
    });
    marriagesOf.set(id, own);
  });

  // Reachability from the main tree, seeded exactly as gedcom2dot.py does.
  const indiIds = Object.keys(gedcom.indis);
  const seed =
    indiIds.find((id) =>
      (firstData(gedcom.indis[id], 'NAME') ?? '').startsWith('Dominik'),
    ) ?? indiIds[0];
  const reachable = new Set<string>();
  const stack = seed ? [seed] : [];
  while (stack.length) {
    const person = stack.pop() as string;
    if (reachable.has(person) || !gedcom.indis[person]) continue;
    reachable.add(person);
    famSpouses.forEach((spouses, famId) => {
      const members = [...spouses, ...(famChildren.get(famId) ?? [])];
      if (members.includes(person)) {
        members.forEach((m) => {
          if (m && !reachable.has(m)) stack.push(m);
        });
      }
    });
  }

  const persons = new Map<string, PersonEvidence>();
  Object.entries(gedcom.indis).forEach(([id, record]) => {
    const facts = factsOf(record, false);
    const marriages = marriagesOf.get(id) ?? [];
    const famc = pointers(record, 'FAMC');
    // "Parents unknown" is not the same as "no FAMC": a sibling group whose
    // parents are still nameless points at a family with no HUSB and no WIFE,
    // and that is precisely where the research has to continue.
    const frontier = famc.length
      ? famc.every((famId) => (famSpouses.get(famId) ?? []).length === 0)
      : true;
    const state = [...facts, ...marriages].reduce<Bucket>(
      (acc, f) => worse(acc, f.bucket),
      'keine',
    );
    persons.set(id, {
      id,
      facts,
      state,
      frontier,
      detached: !reachable.has(id),
      birthLike:
        facts.find((f) => f.tag === 'BIRT') ??
        facts.find((f) => f.tag === 'CHR'),
      deathLike:
        facts.find((f) => f.tag === 'DEAT') ??
        facts.find((f) => f.tag === 'BURI'),
      marriages,
    });
  });

  const allFacts = [
    ...Array.from(persons.values()).flatMap((p) => p.facts),
    ...Array.from(families.values()).flat(),
  ];

  const summary: Summary = {
    facts: allFacts.length,
    urkunde: allFacts.filter((f) => f.bucket === 'urkunde').length,
    zweitzeuge: allFacts.filter((f) => f.bucket === 'zweitzeuge').length,
    hinweis: allFacts.filter((f) => f.bucket === 'hinweis').length,
    ohne: allFacts.filter((f) => f.bucket === 'ohne').length,
  };

  const queues: Queues = {
    ohne: allFacts.filter((f) => f.bucket === 'ohne'),
    // `validate.py` lists as "nur Hinweis" the facts that have a citation and
    // a numeric QUAY of 1 or less — not everything the bucket holds.
    hinweis: allFacts.filter(
      (f) => f.bestQuay !== undefined && f.bestQuay <= 1,
    ),
    unexplained: allFacts.filter((f) => f.unexplained),
    pending: allFacts.filter((f) => f.pending),
    frontier: Array.from(persons.values())
      .filter((p) => p.frontier)
      .map((p) => p.id),
    detached: Array.from(persons.values())
      .filter((p) => p.detached)
      .map((p) => p.id),
  };

  return {persons, families, summary, queues};
}

const cache = new WeakMap<GedcomData, EvidenceIndex>();

/** Computes the evidence index, once per parsed GEDCOM. */
export function computeEvidence(gedcom: GedcomData): EvidenceIndex {
  const cached = cache.get(gedcom);
  if (cached) return cached;
  const index = computeUncached(gedcom);
  cache.set(gedcom, index);
  return index;
}

/**
 * The chart renderer is instantiated by the topola library and never sees React
 * context or props of ours, so the current index is handed to it through this
 * module-level store. It is set once when a file is loaded.
 */
let current: EvidenceIndex | undefined;

export function setCurrentEvidence(index: EvidenceIndex | undefined) {
  current = index;
}

export function getCurrentEvidence(): EvidenceIndex | undefined {
  return current;
}
