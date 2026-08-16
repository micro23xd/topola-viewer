/**
 * How well this person is evidenced, before any of the detail: one line per
 * fact with the tier it rests on and how many citations there are, plus the two
 * research flags the chart draws as borders.
 */

import {FormattedMessage} from 'react-intl';
import {Header, Item, Label} from 'semantic-ui-react';
import {Bucket, Fact, getCurrentEvidence} from '../../util/evidence';
import {GedcomData} from '../../util/gedcom_util';
import {linkForRefn} from '../../util/links';

const BUCKET_TEXT: {[key in Bucket]: string} = {
  urkunde: 'urkundlich',
  zweitzeuge: 'Zweitzeuge',
  hinweis: 'nur Hinweis',
  ohne: 'ohne Quelle',
  keine: 'nichts belegt',
};

const BUCKET_COLOR: {[key in Bucket]: string} = {
  urkunde: '#3a9d5d',
  zweitzeuge: '#d9a400',
  hinweis: '#e07b2a',
  ohne: '#9a9a9a',
  keine: '#c8c8c8',
};

const TAG_TEXT: {[tag: string]: string} = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Begräbnis',
  MARR: 'Heirat',
};

function FactRow({fact}: {fact: Fact}) {
  const count = fact.citations.length;
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
      <span style={{minWidth: '5.5em'}}>{TAG_TEXT[fact.tag] ?? fact.tag}</span>
      <span style={{color: '#666'}}>
        {BUCKET_TEXT[fact.bucket]}
        {count ? ` · ${count} ${count === 1 ? 'Beleg' : 'Belege'}` : ''}
        {fact.pending ? ' · Beleg nachzutragen' : ''}
      </span>
    </div>
  );
}

interface Props {
  gedcom: GedcomData;
  indi: string;
}

export function EvidenceCard({gedcom, indi}: Props) {
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
          facts.map((fact, index) => <FactRow fact={fact} key={index} />)
        ) : (
          <div style={{color: '#666'}}>{BUCKET_TEXT.keine}</div>
        )}
        {person.frontier || person.detached ? (
          <div style={{marginTop: '5px'}}>
            {person.frontier ? (
              <Label
                size="mini"
                style={{background: '#c0392b', color: 'white'}}
              >
                Eltern unbekannt
              </Label>
            ) : null}
            {person.detached ? (
              <Label
                size="mini"
                style={{background: '#7d5ba6', color: 'white'}}
              >
                nicht verbunden
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
