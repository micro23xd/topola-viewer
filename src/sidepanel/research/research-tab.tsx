/**
 * The work queues, on screen, plus the two indexes that answer "where have I
 * been" rather than "who is this": the sources and the places.
 *
 * `make validate` prints the queues on the command line; this is the same
 * arithmetic over the same file, so the header line here and the summary there
 * must always read the same. Every row jumps to the person it names.
 */

import {useMemo, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {Accordion, Checkbox, Icon, Item} from 'semantic-ui-react';
import {EvidenceIndex, Fact, getCurrentEvidence} from '../../util/evidence';
import {evidenceLabels, tagLabel} from '../../util/evidence_labels';
import {GedcomData, getName, pointerToId} from '../../util/gedcom_util';
import {
  ancestorsOf,
  PlaceUse,
  researchIndexes,
  SourceUse,
} from '../../util/research_index';

interface Props {
  gedcom: GedcomData;
  /** The person the panel is showing; the line filter runs upward from here. */
  indi: string;
  onSelectIndi: (id: string) => void;
}

/** The name to print for a fact's owner; families are shown by their spouses. */
function ownerName(fact: Fact, gedcom: GedcomData): string {
  if (!fact.ownerIsFam) {
    const indi = gedcom.indis[fact.owner];
    return (indi && getName(indi)) || fact.owner;
  }
  const fam = gedcom.fams[fact.owner];
  const spouses = (fam?.tree ?? [])
    .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
    .map((entry) => (entry.data ? pointerToId(entry.data) : undefined))
    .map((id) =>
      id && gedcom.indis[id] ? getName(gedcom.indis[id]) : undefined,
    )
    .filter((name): name is string => !!name);
  return spouses.length ? spouses.join(' ⚭ ') : fact.owner;
}

/** The people a fact belongs to: a family's fact belongs to both spouses. */
function ownerPeople(fact: Fact, gedcom: GedcomData): string[] {
  if (!fact.ownerIsFam) return [fact.owner];
  const fam = gedcom.fams[fact.owner];
  return (fam?.tree ?? [])
    .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
    .map((entry) => (entry.data ? pointerToId(entry.data) : undefined))
    .filter((id): id is string => !!id);
}

function Row({
  label,
  suffix,
  id,
  onSelectIndi,
}: {
  label: string;
  suffix?: string;
  id?: string;
  onSelectIndi: (id: string) => void;
}) {
  return (
    <div style={{padding: '1px 0'}}>
      {id ? (
        <a onClick={() => onSelectIndi(id)} style={{cursor: 'pointer'}}>
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      {suffix ? <span style={{color: '#888'}}> {suffix}</span> : null}
    </div>
  );
}

function FactQueue({
  facts,
  gedcom,
  onSelectIndi,
  withQuay,
}: {
  facts: Fact[];
  gedcom: GedcomData;
  onSelectIndi: (id: string) => void;
  withQuay?: boolean;
}) {
  const intl = useIntl();
  const labels = evidenceLabels(intl.locale);
  return (
    <>
      {facts.map((fact, index) => (
        <Row
          key={index}
          label={ownerName(fact, gedcom)}
          suffix={
            tagLabel(labels, fact.tag) +
            (withQuay && fact.bestQuay !== undefined
              ? ` · ${labels.quay(fact.bestQuay)}`
              : '')
          }
          id={ownerPeople(fact, gedcom)[0]}
          onSelectIndi={onSelectIndi}
        />
      ))}
    </>
  );
}

function PersonQueue({
  ids,
  gedcom,
  onSelectIndi,
}: {
  ids: string[];
  gedcom: GedcomData;
  onSelectIndi: (id: string) => void;
}) {
  return (
    <>
      {ids.map((id) => (
        <Row
          key={id}
          label={(gedcom.indis[id] && getName(gedcom.indis[id])) || id}
          id={id}
          onSelectIndi={onSelectIndi}
        />
      ))}
    </>
  );
}

function SourceList({
  sources,
  gedcom,
  onSelectIndi,
}: {
  sources: SourceUse[];
  gedcom: GedcomData;
  onSelectIndi: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  return (
    <>
      {sources.map((source) => (
        <div key={source.sourceId} style={{padding: '2px 0'}}>
          <a
            onClick={() =>
              setOpen(open === source.sourceId ? undefined : source.sourceId)
            }
            style={{cursor: 'pointer'}}
          >
            {source.title}
          </a>
          <span style={{color: '#888'}}>
            {' '}
            · {source.citations}
            {source.repoWww ? (
              <>
                {' · '}
                <a
                  href={source.repoWww}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.repoName ?? source.repoWww}
                </a>
              </>
            ) : null}
          </span>
          {open === source.sourceId ? (
            <div style={{marginLeft: '1em', marginBottom: '4px'}}>
              {source.author ? (
                <div style={{color: '#666'}}>{source.author}</div>
              ) : null}
              {source.people.map((id) => (
                <Row
                  key={id}
                  label={(gedcom.indis[id] && getName(gedcom.indis[id])) || id}
                  id={id}
                  onSelectIndi={onSelectIndi}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function PlaceList({
  places,
  gedcom,
  onSelectIndi,
}: {
  places: PlaceUse[];
  gedcom: GedcomData;
  onSelectIndi: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  return (
    <>
      {places.map((place) => (
        <div key={place.place} style={{padding: '2px 0'}}>
          <a
            onClick={() =>
              setOpen(open === place.place ? undefined : place.place)
            }
            style={{cursor: 'pointer'}}
          >
            {place.place}
          </a>
          <span style={{color: '#888'}}> · {place.events}</span>
          {open === place.place ? (
            <div style={{marginLeft: '1em', marginBottom: '4px'}}>
              {place.people.map((id) => (
                <Row
                  key={id}
                  label={(gedcom.indis[id] && getName(gedcom.indis[id])) || id}
                  id={id}
                  onSelectIndi={onSelectIndi}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function ResearchTab({gedcom, indi, onSelectIndi}: Props) {
  const intl = useIntl();
  const labels = evidenceLabels(intl.locale);
  const [open, setOpen] = useState(-1);
  const [lineOnly, setLineOnly] = useState(false);
  const evidence = getCurrentEvidence();

  // The ancestors of the person on screen — the "line" the filter restricts to.
  const line = useMemo(
    () => (lineOnly ? ancestorsOf(gedcom, indi) : undefined),
    [gedcom, indi, lineOnly],
  );
  const indexes = useMemo(() => researchIndexes(gedcom), [gedcom]);

  if (!evidence) return null;

  const keepFact = (fact: Fact) =>
    !line || ownerPeople(fact, gedcom).some((id) => line.has(id));
  const keepPerson = (id: string) => !line || line.has(id);

  const filtered: EvidenceIndex['queues'] = {
    ohne: evidence.queues.ohne.filter(keepFact),
    hinweis: evidence.queues.hinweis.filter(keepFact),
    unexplained: evidence.queues.unexplained.filter(keepFact),
    pending: evidence.queues.pending.filter(keepFact),
    frontier: evidence.queues.frontier.filter(keepPerson),
    detached: evidence.queues.detached.filter(keepPerson),
  };

  const sources = line
    ? indexes.sources
        .map((source) => ({
          ...source,
          people: source.people.filter(keepPerson),
        }))
        .filter((source) => source.people.length)
    : indexes.sources;
  const places = line
    ? indexes.places
        .map((place) => ({...place, people: place.people.filter(keepPerson)}))
        .filter((place) => place.people.length)
    : indexes.places;

  const sections = [
    {
      title: `${labels.bucket.ohne} — ${filtered.ohne.length}`,
      hint: intl.formatMessage({
        id: 'research.hint.ohne',
        defaultMessage: 'assert a date or a place with no citation at all',
      }),
      content: (
        <FactQueue
          facts={filtered.ohne}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      title: `${labels.bucket.hinweis} — ${filtered.hinweis.length}`,
      hint: intl.formatMessage({
        id: 'research.hint.hinweis',
        defaultMessage:
          'rest on a compiled tree or on family memory (QUAY 0–1)',
      }),
      content: (
        <FactQueue
          facts={filtered.hinweis}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
          withQuay
        />
      ),
    },
    {
      title: intl.formatMessage(
        {
          id: 'research.queue.unexplained',
          defaultMessage: 'of those, without a NOTE — {count}',
        },
        {count: filtered.unexplained.length},
      ),
      hint: intl.formatMessage({
        id: 'research.hint.unexplained',
        defaultMessage: 'nothing explains the reasoning — document or remove',
      }),
      content: (
        <FactQueue
          facts={filtered.unexplained}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
          withQuay
        />
      ),
    },
    {
      title: `${labels.pending} — ${filtered.pending.length}`,
      hint: intl.formatMessage({
        id: 'research.hint.pending',
        defaultMessage:
          'from the local research, without its underlying register reference',
      }),
      content: (
        <FactQueue
          facts={filtered.pending}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      title: `${labels.frontier} — ${filtered.frontier.length}`,
      hint: intl.formatMessage({
        id: 'research.hint.frontier',
        defaultMessage: 'where the research has to continue',
      }),
      content: (
        <PersonQueue
          ids={filtered.frontier}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      title: `${labels.detached} — ${filtered.detached.length}`,
      hint: intl.formatMessage({
        id: 'research.hint.detached',
        defaultMessage: 'not attached to anyone yet',
      }),
      content: (
        <PersonQueue
          ids={filtered.detached}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      title: intl.formatMessage(
        {id: 'research.sources', defaultMessage: 'Sources — {count}'},
        {count: sources.length},
      ),
      hint: intl.formatMessage({
        id: 'research.hint.sources',
        defaultMessage: 'how often each is cited, and by whom',
      }),
      content: (
        <SourceList
          sources={sources}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      title: intl.formatMessage(
        {id: 'research.places', defaultMessage: 'Places — {count}'},
        {count: places.length},
      ),
      hint: intl.formatMessage({
        id: 'research.hint.places',
        defaultMessage: 'every place the file names, by number of events',
      }),
      content: (
        <PlaceList
          places={places}
          gedcom={gedcom}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
  ];

  const {summary} = evidence;
  const person = gedcom.indis[indi];

  return (
    <div className="research" data-testid="research">
      <Item.Group>
        <Item>
          <Item.Content>
            <div style={{marginBottom: '8px'}}>
              <FormattedMessage
                id="research.summary"
                defaultMessage="{facts} facts: {urkunde} from records, {zweitzeuge} secondary, {hinweis} leads only, {ohne} with no source"
                values={{
                  facts: <b>{summary.facts}</b>,
                  urkunde: summary.urkunde,
                  zweitzeuge: summary.zweitzeuge,
                  hinweis: summary.hinweis,
                  ohne: summary.ohne,
                }}
              />
            </div>
            {person ? (
              <Checkbox
                style={{marginBottom: '8px'}}
                label={intl.formatMessage(
                  {
                    id: 'research.line_only',
                    defaultMessage: 'only the line above {name}',
                  },
                  {name: getName(person) ?? indi},
                )}
                checked={lineOnly}
                onChange={() => setLineOnly(!lineOnly)}
              />
            ) : null}
            <Accordion fluid styled>
              {sections.map((section, index) => (
                <div key={index}>
                  <Accordion.Title
                    active={open === index}
                    onClick={() => setOpen(open === index ? -1 : index)}
                  >
                    <Icon name="dropdown" />
                    {section.title}
                  </Accordion.Title>
                  <Accordion.Content active={open === index}>
                    <div
                      style={{
                        color: '#888',
                        fontSize: '0.95em',
                        marginBottom: '4px',
                      }}
                    >
                      {section.hint}
                    </div>
                    {section.content}
                  </Accordion.Content>
                </div>
              ))}
            </Accordion>
          </Item.Content>
        </Item>
      </Item.Group>
    </div>
  );
}
