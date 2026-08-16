/**
 * One life, in order, with the ages worked out.
 *
 * The events panel below groups by kind and hides the arithmetic that matters
 * when you are judging a record: how old someone was at a marriage, whether a
 * child was born after the father died, whether an age at burial can be true.
 * This is the same events plus the family's — marriages, children, the death
 * of a spouse — on one axis.
 */

import {GedcomEntry} from 'parse-gedcom';
import {FormattedMessage, useIntl} from 'react-intl';
import {Header, Item} from 'semantic-ui-react';
import {evidenceLabels, tagLabel} from '../../util/evidence_labels';
import {GedcomData, getName, pointerToId} from '../../util/gedcom_util';

interface Entry {
  year: number;
  date: string;
  what: string;
  who?: string;
}

const TAG_MESSAGE: {[tag: string]: string} = {
  BIRT: 'BIRT',
  CHR: 'CHR',
  DEAT: 'DEAT',
  BURI: 'BURI',
  MARR: 'MARR',
};

function firstChild(entry: GedcomEntry, tag: string) {
  return entry.tree.find((sub) => sub.tag === tag);
}

/** The year in a GEDCOM date, ignoring ABT/BEF/AFT and the day. */
function year(date?: string): number | undefined {
  const match = date?.match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : undefined;
}

function eventEntry(
  record: GedcomEntry,
  tag: string,
  what: string,
  who?: string,
): Entry | undefined {
  const event = firstChild(record, tag);
  const date = event && firstChild(event, 'DATE')?.data;
  const y = year(date);
  return y !== undefined && date ? {year: y, date, what, who} : undefined;
}

interface Props {
  gedcom: GedcomData;
  indi: string;
}

export function Timeline({gedcom, indi}: Props) {
  const intl = useIntl();
  const labels = evidenceLabels(intl.locale);
  const person = gedcom.indis[indi];
  if (!person) return null;

  const entries: Array<Entry | undefined> = [];
  Object.keys(TAG_MESSAGE)
    .filter((tag) => tag !== 'MARR')
    .forEach((tag) =>
      entries.push(eventEntry(person, tag, tagLabel(labels, tag))),
    );

  person.tree
    .filter((entry) => entry.tag === 'FAMS' && entry.data)
    .map((entry) => gedcom.fams[pointerToId(entry.data as string)])
    .filter((family): family is GedcomEntry => !!family)
    .forEach((family) => {
      const spouse = family.tree.find(
        (entry) =>
          (entry.tag === 'HUSB' || entry.tag === 'WIFE') &&
          entry.data &&
          pointerToId(entry.data) !== indi,
      );
      const spousePerson = spouse?.data
        ? gedcom.indis[pointerToId(spouse.data)]
        : undefined;
      const spouseName = spousePerson ? getName(spousePerson) : undefined;
      entries.push(
        eventEntry(family, 'MARR', tagLabel(labels, 'MARR'), spouseName),
      );
      if (spousePerson) {
        const death = eventEntry(
          spousePerson,
          'DEAT',
          intl.formatMessage({
            id: 'timeline.spouse_death',
            defaultMessage: 'death of the spouse',
          }),
          spouseName,
        );
        entries.push(death);
      }
      family.tree
        .filter((entry) => entry.tag === 'CHIL' && entry.data)
        .map((entry) => gedcom.indis[pointerToId(entry.data as string)])
        .filter((child): child is GedcomEntry => !!child)
        .forEach((child) =>
          entries.push(
            eventEntry(
              child,
              'BIRT',
              intl.formatMessage({
                id: 'timeline.child_born',
                defaultMessage: 'a child is born',
              }),
              getName(child),
            ),
          ),
        );
    });

  const timeline = entries
    .filter((entry): entry is Entry => !!entry)
    .sort((a, b) => a.year - b.year);
  if (timeline.length < 2) return null;

  const birthYear = year(
    firstChild(person, 'BIRT')?.tree.find((sub) => sub.tag === 'DATE')?.data,
  );

  return (
    <Item>
      <Item.Content>
        <Header sub>
          <FormattedMessage id="timeline.header" defaultMessage="Timeline" />
        </Header>
        {timeline.map((entry, index) => (
          <div
            key={index}
            style={{display: 'flex', gap: '8px', alignItems: 'baseline'}}
          >
            <span style={{minWidth: '3.2em', color: '#666'}}>{entry.year}</span>
            <span style={{minWidth: '2.6em', color: '#999'}}>
              {birthYear !== undefined && entry.year >= birthYear
                ? `${entry.year - birthYear}`
                : ''}
            </span>
            <span>
              {entry.what}
              {entry.who ? (
                <span style={{color: '#666'}}> · {entry.who}</span>
              ) : null}
            </span>
          </div>
        ))}
      </Item.Content>
    </Item>
  );
}
