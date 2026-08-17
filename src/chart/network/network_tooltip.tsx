/**
 * What is actually known about the person under the pointer.
 *
 * The chart can only say so much in a box: a name, two years, a row of dots.
 * The evidence behind those years — the exact date, the place, the tier, which
 * source and which page — was a click away in the side panel, which is the
 * wrong distance while you are reading the chart and deciding what to look at
 * next. This is that, at a glance, without moving.
 *
 * It stays a summary. Notes, the links into the portals and the timeline are
 * still one click away in the panel; repeating them here would make a second
 * details view that has to be kept in step with the first.
 */

import {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {TierBadge} from '../../sidepanel/details/sources';
import {translateDate} from '../../util/date_util';
import {Fact, getCurrentEvidence, PersonEvidence} from '../../util/evidence';
import {evidenceLabels, tagLabel} from '../../util/evidence_labels';
import {GedcomData, getName, pointerToId} from '../../util/gedcom_util';
import {PlaceDisplay, shortenPlace} from '../../util/place_util';
import {researchIndexes} from '../../util/research_index';
import {factsOf} from '../evidence_dots';
import {HoverTarget} from './network_chart';

interface Props {
  gedcom?: GedcomData;
  target?: HoverTarget;
}

/** Wide enough for a source line, narrow enough to sit beside a box. */
const WIDTH = 340;
/** Enough to keep the card on screen without measuring it first. */
const ASSUMED_HEIGHT = 300;
/** Long enough not to flicker while the pointer crosses the chart. */
const DELAY_MS = 150;

export function NetworkTooltip({gedcom, target}: Props) {
  const intl = useIntl();
  const [shown, setShown] = useState<HoverTarget | undefined>(undefined);

  useEffect(() => {
    if (!target) {
      setShown(undefined);
      return;
    }
    const timer = setTimeout(() => setShown(target), DELAY_MS);
    return () => clearTimeout(timer);
  }, [target]);

  const evidence = getCurrentEvidence();
  if (!shown || !gedcom || !evidence) return null;

  const labels = evidenceLabels(intl.locale);
  const titles = new Map(
    researchIndexes(gedcom).sources.map((source) => [
      source.sourceId,
      source.title,
    ]),
  );

  const spouseOf = (famId: string, notThisOne?: string) =>
    (gedcom.fams[famId]?.tree ?? [])
      .filter((entry) => entry.tag === 'HUSB' || entry.tag === 'WIFE')
      .map((entry) => (entry.data ? pointerToId(entry.data) : undefined))
      .filter((id): id is string => !!id && id !== notThisOne)
      .map((id) => (gedcom.indis[id] ? getName(gedcom.indis[id]) : undefined))
      .filter((name): name is string => !!name);

  function FactLine({
    fact,
    subject,
    named,
  }: {
    fact: Fact;
    subject?: string;
    /** The couple is already in the heading; do not say it twice. */
    named?: boolean;
  }) {
    const when = fact.date ? translateDate(fact.date, intl) : undefined;
    const where = shortenPlace(fact.place, PlaceDisplay.SHORT, 2);
    const partners =
      fact.ownerIsFam && !named ? spouseOf(fact.owner, subject) : [];
    return (
      <div style={{marginTop: '6px'}}>
        <div style={{display: 'flex', gap: '6px', alignItems: 'baseline'}}>
          <span style={{fontWeight: 600, minWidth: '5.5em'}}>
            {tagLabel(labels, fact.tag)}
          </span>
          <span>
            {[when, where].filter((part) => !!part).join(' · ') ||
              labels.notRecorded}
            {partners.length ? (
              <span style={{color: '#666'}}> ⚭ {partners.join(', ')}</span>
            ) : null}
          </span>
        </div>
        <div style={{marginLeft: '5.5em', marginTop: '2px'}}>
          <TierBadge quay={fact.bestQuay} />
          {fact.citations.length === 0 ? (
            <span style={{color: '#999'}}>{labels.citations(0)}</span>
          ) : null}
          {fact.citations.map((citation, index) => (
            <div key={index} style={{color: '#555', marginTop: '2px'}}>
              {titles.get(citation.sourceId) ?? citation.sourceId}
              {citation.page ? (
                <span style={{color: '#888'}}> · {citation.page}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function personCard(person: PersonEvidence, id: string) {
    const indi = gedcom?.indis[id];
    const name = indi ? getName(indi) : id;
    const flags = [
      person.frontier ? labels.frontier : undefined,
      person.detached ? labels.detached : undefined,
    ].filter((flag): flag is string => !!flag);
    return (
      <>
        <div style={{fontWeight: 700, fontSize: '13px'}}>{name}</div>
        {flags.length ? (
          <div style={{color: '#c0392b', fontSize: '10px'}}>
            {flags.join(' · ')}
          </div>
        ) : null}
        {factsOf(person).length ? (
          factsOf(person).map((fact, index) => (
            <FactLine key={index} fact={fact} subject={id} />
          ))
        ) : (
          <div style={{marginTop: '6px', color: '#999'}}>
            {labels.bucket.keine}
          </div>
        )}
      </>
    );
  }

  function unionCard(famId: string) {
    const facts = evidence?.families.get(famId) ?? [];
    const marriage = facts.find((entry) => entry.tag === 'MARR');
    const couple = spouseOf(famId);
    return (
      <>
        <div style={{fontWeight: 700, fontSize: '13px'}}>
          {couple.join(' ⚭ ') || famId}
        </div>
        {marriage ? (
          <FactLine fact={marriage} named />
        ) : (
          <div style={{marginTop: '6px', color: '#999'}}>
            {tagLabel(labels, 'MARR')}: {labels.notRecorded}
          </div>
        )}
      </>
    );
  }

  const person = shown.personId
    ? evidence.persons.get(shown.personId)
    : undefined;
  const body =
    person && shown.personId
      ? personCard(person, shown.personId)
      : shown.unionId
        ? unionCard(shown.unionId)
        : null;
  if (!body) return null;

  const box = shown.box;
  const flip = box.right + WIDTH + 24 > window.innerWidth;
  return (
    <div
      className="network-tooltip"
      style={{
        position: 'fixed',
        left: flip ? Math.max(8, box.left - WIDTH - 12) : box.right + 12,
        top: Math.max(
          8,
          Math.min(box.top, window.innerHeight - ASSUMED_HEIGHT - 8),
        ),
        width: `${WIDTH}px`,
        maxHeight: '60vh',
        overflow: 'hidden',
        zIndex: 20,
        background: 'rgba(255, 255, 255, 0.97)',
        border: '1px solid #d4d4d5',
        borderRadius: '4px',
        padding: '8px 10px',
        fontSize: '11px',
        lineHeight: '1.45',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
        pointerEvents: 'none',
      }}
    >
      {body}
    </div>
  );
}
