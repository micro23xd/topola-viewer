/**
 * The words for evidence, in both languages.
 *
 * The React side says these things through react-intl, but the chart renderer
 * is constructed by the topola library and has no access to a provider — it
 * gets a locale string and nothing else. Rather than keep two vocabularies,
 * both sides read the tables here, and the message ids in `de.json` match the
 * keys so a translator sees one list.
 */

import {Bucket} from './evidence';

export interface EvidenceLabels {
  bucket: {[key in Bucket]: string};
  tag: {[tag: string]: string};
  /** "3 Belege" / "3 citations", including the "no citation" case. */
  citations: (count: number) => string;
  quay: (quay?: number) => string;
  notRecorded: string;
  frontier: string;
  detached: string;
  pending: string;
  dotsCaption: string;
  header: string;
}

const DE: EvidenceLabels = {
  bucket: {
    urkunde: 'urkundlich',
    zweitzeuge: 'Zweitzeuge',
    hinweis: 'nur Hinweis',
    ohne: 'ohne Quelle',
    keine: 'nichts belegt',
  },
  tag: {
    BIRT: 'Geburt',
    CHR: 'Taufe',
    DEAT: 'Tod',
    BURI: 'Begräbnis',
    MARR: 'Heirat',
  },
  citations: (count) =>
    count === 0 ? 'kein Beleg' : count === 1 ? '1 Beleg' : `${count} Belege`,
  quay: (quay) => (quay !== undefined ? `QUAY ${quay}` : 'ohne QUAY'),
  notRecorded: 'nicht erfasst',
  frontier: 'Eltern unbekannt',
  detached: 'nicht verbunden',
  pending: 'Beleg nachzutragen',
  dotsCaption: 'Punkte: Geburt · Tod · Heirat',
  header: 'Belege',
};

const EN: EvidenceLabels = {
  bucket: {
    urkunde: 'record',
    zweitzeuge: 'secondary witness',
    hinweis: 'lead only',
    ohne: 'no source',
    keine: 'nothing evidenced',
  },
  tag: {
    BIRT: 'Birth',
    CHR: 'Baptism',
    DEAT: 'Death',
    BURI: 'Burial',
    MARR: 'Marriage',
  },
  citations: (count) =>
    count === 0
      ? 'no citation'
      : count === 1
        ? '1 citation'
        : `${count} citations`,
  quay: (quay) => (quay !== undefined ? `QUAY ${quay}` : 'no QUAY'),
  notRecorded: 'not recorded',
  frontier: 'parents unknown',
  detached: 'not connected',
  pending: 'citation outstanding',
  dotsCaption: 'Dots: birth · death · marriage',
  header: 'Evidence',
};

/** The labels for a locale string such as `de-DE`; English for anything else. */
export function evidenceLabels(locale?: string): EvidenceLabels {
  return locale?.toLowerCase().startsWith('de') ? DE : EN;
}

/** The label a fact tag gets, falling back to the tag itself. */
export function tagLabel(labels: EvidenceLabels, tag: string): string {
  return labels.tag[tag] ?? tag;
}
