/**
 * The work queues, on screen.
 *
 * `make validate` prints these lists on the command line; this is the same
 * arithmetic over the same file, so the header line here and the summary there
 * must always read the same. Every row jumps to the person it names.
 */

import {useState} from 'react';
import {Accordion, Icon, Item} from 'semantic-ui-react';
import {EvidenceIndex, Fact, getCurrentEvidence} from '../../util/evidence';
import {GedcomData, getName} from '../../util/gedcom_util';

const TAG_TEXT: {[tag: string]: string} = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Begräbnis',
  MARR: 'Heirat',
};

interface Props {
  gedcom: GedcomData;
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
    .map((entry) => entry.data?.replace(/@/g, ''))
    .map((id) =>
      id && gedcom.indis[id] ? getName(gedcom.indis[id]) : undefined,
    )
    .filter((name): name is string => !!name);
  return spouses.length ? spouses.join(' ⚭ ') : fact.owner;
}

/** The person a row should jump to: a family jumps to its husband or wife. */
function ownerIndi(fact: Fact, gedcom: GedcomData): string | undefined {
  if (!fact.ownerIsFam) return fact.owner;
  const fam = gedcom.fams[fact.owner];
  const spouse = (fam?.tree ?? []).find(
    (entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE',
  );
  return spouse?.data?.replace(/@/g, '');
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
  return (
    <>
      {facts.map((fact, index) => (
        <Row
          key={index}
          label={ownerName(fact, gedcom)}
          suffix={
            (TAG_TEXT[fact.tag] ?? fact.tag) +
            (withQuay && fact.bestQuay !== undefined
              ? ` · QUAY ${fact.bestQuay}`
              : '')
          }
          id={ownerIndi(fact, gedcom)}
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

function queues(
  evidence: EvidenceIndex,
  gedcom: GedcomData,
  onSelect: (id: string) => void,
) {
  const q = evidence.queues;
  return [
    {
      title: `ohne Quelle — ${q.ohne.length}`,
      hint: 'behaupten ein Datum oder einen Ort ohne jede Zitation',
      content: (
        <FactQueue facts={q.ohne} gedcom={gedcom} onSelectIndi={onSelect} />
      ),
    },
    {
      title: `nur Hinweis — ${q.hinweis.length}`,
      hint: 'ruhen auf einem kompilierten Baum oder auf Familienangabe (QUAY 0–1)',
      content: (
        <FactQueue
          facts={q.hinweis}
          gedcom={gedcom}
          onSelectIndi={onSelect}
          withQuay
        />
      ),
    },
    {
      title: `davon ohne NOTE — ${q.unexplained.length}`,
      hint: 'ohne begründenden NOTE — dokumentieren oder entfernen',
      content: (
        <FactQueue
          facts={q.unexplained}
          gedcom={gedcom}
          onSelectIndi={onSelect}
          withQuay
        />
      ),
    },
    {
      title: `Beleg nachzutragen — ${q.pending.length}`,
      hint: 'aus der Bieberer Ortsforschung, ohne deren Registerreferenz',
      content: (
        <FactQueue facts={q.pending} gedcom={gedcom} onSelectIndi={onSelect} />
      ),
    },
    {
      title: `Eltern unbekannt — ${q.frontier.length}`,
      hint: 'die Forschungsfront',
      content: (
        <PersonQueue ids={q.frontier} gedcom={gedcom} onSelectIndi={onSelect} />
      ),
    },
    {
      title: `nicht verbunden — ${q.detached.length}`,
      hint: 'noch an niemanden angeschlossen',
      content: (
        <PersonQueue ids={q.detached} gedcom={gedcom} onSelectIndi={onSelect} />
      ),
    },
  ];
}

export function ResearchTab({gedcom, onSelectIndi}: Props) {
  const [open, setOpen] = useState(-1);
  const evidence = getCurrentEvidence();
  if (!evidence) return null;

  const {summary} = evidence;
  const sections = queues(evidence, gedcom, onSelectIndi);

  return (
    <div className="research" data-testid="research">
      <Item.Group>
        <Item>
          <Item.Content>
            <div style={{marginBottom: '8px'}}>
              <b>{summary.facts} Fakten:</b> {summary.urkunde} urkundlich,{' '}
              {summary.zweitzeuge} Zweitzeuge, {summary.hinweis} nur Hinweis,{' '}
              {summary.ohne} ohne Quelle
            </div>
            <Accordion fluid styled>
              {sections.map((section, index) => (
                <div key={section.title}>
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
