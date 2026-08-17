/**
 * How well this person is evidenced, before any of the detail: one line per
 * fact with the tier it rests on and how many citations there are, plus the two
 * research flags the chart draws as borders.
 */

import {FormattedMessage, useIntl} from 'react-intl';
import {Header, Item, Label} from 'semantic-ui-react';
import {Bucket, Fact, getCurrentEvidence} from '../../util/evidence';
import {
  EvidenceLabels,
  evidenceLabels,
  tagLabel,
} from '../../util/evidence_labels';
import {GedcomData} from '../../util/gedcom_util';
import {linkForRefn} from '../../util/links';

export const BUCKET_COLOR: {[key in Bucket]: string} = {
  urkunde: '#3a9d5d',
  zweitzeuge: '#d9a400',
  hinweis: '#e07b2a',
  ohne: '#9a9a9a',
  keine: '#c8c8c8',
};

function FactRow({fact, labels}: {fact: Fact; labels: EvidenceLabels}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
      <span
        style={{
          width: '9px',
          height: '9px',
          borderRadius: '50%',
          flex: '0 0 auto',
          background: BUCKET_COLOR[fact.bucket],
        }}
      />
      <span style={{minWidth: '5.5em'}}>{tagLabel(labels, fact.tag)}</span>
      <span style={{color: '#666'}}>
        {labels.bucket[fact.bucket]}
        {fact.citations.length
          ? ` · ${labels.citations(fact.citations.length)}`
          : ''}
        {fact.pending ? ` · ${labels.pending}` : ''}
      </span>
    </div>
  );
}

interface Props {
  gedcom: GedcomData;
  indi: string;
}

export function EvidenceCard({gedcom, indi}: Props) {
  const intl = useIntl();
  const labels = evidenceLabels(intl.locale);
  const person = getCurrentEvidence()?.persons.get(indi);
  if (!person) return null;

  const refn = gedcom.indis[indi]?.tree.find((entry) => entry.tag === 'REFN');
  const treeLink = refn
    ? linkForRefn({
        value: refn.data,
        type: refn.tree.find((sub) => sub.tag === 'TYPE')?.data,
      })
    : undefined;

  const facts = [...person.facts, ...person.marriages];

  return (
    <Item>
      <Item.Content>
        <Header sub>
          <FormattedMessage id="evidence.header" defaultMessage="Belege" />
        </Header>
        {facts.length ? (
          facts.map((fact, index) => (
            <FactRow fact={fact} labels={labels} key={index} />
          ))
        ) : (
          <div style={{color: '#666'}}>{labels.bucket.keine}</div>
        )}
        {person.frontier || person.detached ? (
          <div style={{marginTop: '5px'}}>
            {person.frontier ? (
              <Label
                size="mini"
                style={{background: '#c0392b', color: 'white'}}
              >
                {labels.frontier}
              </Label>
            ) : null}
            {person.detached ? (
              <Label
                size="mini"
                style={{background: '#7d5ba6', color: 'white'}}
              >
                {labels.detached}
              </Label>
            ) : null}
          </div>
        ) : null}
        {treeLink ? (
          <div style={{marginTop: '5px'}}>
            <a href={treeLink.url} target="_blank" rel="noopener noreferrer">
              {treeLink.label}
            </a>
          </div>
        ) : null}
      </Item.Content>
    </Item>
  );
}
