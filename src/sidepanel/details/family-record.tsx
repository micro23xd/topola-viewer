/**
 * What is written about the *link* rather than about the people.
 *
 * A citation directly on a FAM record cites the relationship — that these two
 * were married, that this child belongs to these parents — and a note on a FAM
 * record is usually the argument for it. Neither belongs to any event, so
 * neither appeared anywhere in the panel; on a tree whose parent-child links
 * are the thing most worth doubting, that is the wrong omission.
 */

import {GedcomEntry} from 'parse-gedcom';
import {FormattedMessage} from 'react-intl';
import {Header, Item} from 'semantic-ui-react';
import {
  GedcomData,
  getData,
  getName,
  mapToSource,
  pointerToId,
} from '../../util/gedcom_util';
import {NoteText} from './note-text';
import {PersonLink} from './person-link';
import {Sources} from './sources';

interface Props {
  gedcom: GedcomData;
  indi: string;
}

function spouseOf(
  family: GedcomEntry,
  indi: string,
  gedcom: GedcomData,
): GedcomEntry | undefined {
  const other = family.tree.find(
    (entry) =>
      (entry.tag === 'HUSB' || entry.tag === 'WIFE') &&
      entry.data &&
      pointerToId(entry.data) !== indi,
  );
  return other?.data ? gedcom.indis[pointerToId(other.data)] : undefined;
}

function parentsOf(family: GedcomEntry, gedcom: GedcomData): GedcomEntry[] {
  return family.tree
    .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
    .map((entry) =>
      entry.data ? gedcom.indis[pointerToId(entry.data)] : undefined,
    )
    .filter((person): person is GedcomEntry => !!person);
}

function FamilySection({
  family,
  indi,
  gedcom,
  asChild,
}: {
  family: GedcomEntry;
  indi: string;
  gedcom: GedcomData;
  asChild: boolean;
}) {
  const sources = family.tree
    .filter((entry) => entry.tag === 'SOUR')
    .map((entry) => mapToSource(entry, gedcom));
  const notes = family.tree
    .filter((entry) => entry.tag === 'NOTE')
    .flatMap((note) => getData(note));

  if (!sources.length && !notes.length) {
    return null;
  }

  const people = asChild
    ? parentsOf(family, gedcom)
    : [spouseOf(family, indi, gedcom)].filter((p): p is GedcomEntry => !!p);

  return (
    <Item>
      <Item.Content>
        <Header sub>
          {asChild ? (
            <FormattedMessage
              id="family.as_child"
              defaultMessage="This link to the parents"
            />
          ) : (
            <FormattedMessage
              id="family.as_spouse"
              defaultMessage="This marriage"
            />
          )}
        </Header>
        {people.length ? (
          <div style={{marginBottom: '4px'}}>
            {people.map((person, index) => (
              <span key={person.pointer}>
                {index ? ' · ' : ''}
                {getName(person) ? <PersonLink person={person} /> : null}
              </span>
            ))}
          </div>
        ) : null}
        {notes.length ? <NoteText lines={notes} gedcom={gedcom} /> : null}
        <Sources sources={sources} />
      </Item.Content>
    </Item>
  );
}

export function FamilyRecord({gedcom, indi}: Props) {
  const person = gedcom.indis[indi];
  if (!person) return null;

  const sections = (['FAMS', 'FAMC'] as const).flatMap((tag) =>
    person.tree
      .filter((entry) => entry.tag === tag && entry.data)
      .map((entry) => gedcom.fams[pointerToId(entry.data as string)])
      .filter((family): family is GedcomEntry => !!family)
      .map((family) => (
        <FamilySection
          key={`${tag}-${family.pointer}`}
          family={family}
          indi={indi}
          gedcom={gedcom}
          asChild={tag === 'FAMC'}
        />
      )),
  );

  return <>{sections}</>;
}
