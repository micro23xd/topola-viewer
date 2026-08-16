/**
 * What the colours on the chart mean, in the wording the research uses.
 * Shown only while the chart is coloured by evidence.
 */

import {useIntl} from 'react-intl';
import {Bucket, EvidenceIndex} from '../util/evidence';
import {evidenceLabels} from '../util/evidence_labels';

const BOX_FILLS: {[key in Bucket]: string} = {
  urkunde: '#e3f4e1',
  zweitzeuge: '#fff4d6',
  hinweis: '#ffe0c2',
  ohne: '#f2f2f2',
  keine: '#fafafa',
};

const BOX_ORDER: Bucket[] = [
  'urkunde',
  'zweitzeuge',
  'hinweis',
  'ohne',
  'keine',
];

const DOTS: Array<{fill: string; stroke?: string; label: string}> = [
  {fill: '#3a9d5d', label: 'QUAY 3'},
  {fill: '#d9a400', label: 'QUAY 2'},
  {fill: '#e07b2a', label: 'QUAY 0–1'},
  {fill: '#9a9a9a', label: ''},
  {fill: '#ffffff', stroke: '#c8c8c8', label: ''},
];

interface Props {
  evidence?: EvidenceIndex;
  /** The ancestor network draws no per-fact dots; it badges repeats instead. */
  network?: boolean;
}

export function EvidenceLegend({evidence, network}: Props) {
  const intl = useIntl();
  const labels = evidenceLabels(intl.locale);
  const dots = DOTS.map((dot, index) => ({
    ...dot,
    label:
      dot.label || (index === 3 ? labels.quay(undefined) : labels.notRecorded),
  }));
  const borders = [
    {stroke: '#c0392b', label: labels.frontier},
    {stroke: '#7d5ba6', label: labels.detached},
  ];
  const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
  };
  return (
    <div
      className="evidence-legend"
      style={{
        // Positioned by the overlay stack in view_page, so it and the network's
        // display card can sit above one another without either guessing the
        // other's height.
        background: 'rgba(255, 255, 255, 0.94)',
        border: '1px solid #d4d4d5',
        borderRadius: '4px',
        padding: '8px 10px',
        fontSize: '11px',
        lineHeight: '1.5',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
        pointerEvents: 'none',
      }}
    >
      <div style={{fontWeight: 'bold', marginBottom: '4px'}}>
        {labels.header}
      </div>
      {BOX_ORDER.map((bucket) => (
        <div key={bucket} style={row}>
          <span
            style={{
              width: '14px',
              height: '10px',
              background: BOX_FILLS[bucket],
              border: '1px solid #333',
              borderRadius: '2px',
            }}
          />
          {labels.bucket[bucket]}
        </div>
      ))}
      <div style={{height: '5px'}} />
      {borders.map((border) => (
        <div key={border.label} style={row}>
          <span
            style={{
              width: '14px',
              height: '10px',
              background: 'transparent',
              border: `2px solid ${border.stroke}`,
              borderRadius: '2px',
            }}
          />
          {border.label}
        </div>
      ))}
      <div style={{height: '5px'}} />
      {network ? (
        <div>{labels.pathsCaption}</div>
      ) : (
        <>
          <div style={{marginBottom: '2px'}}>{labels.dotsCaption}</div>
          {dots.map((dot) => (
            <div key={dot.label} style={row}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  background: dot.fill,
                  border: dot.stroke ? `1px solid ${dot.stroke}` : 'none',
                  borderRadius: '50%',
                }}
              />
              {dot.label}
            </div>
          ))}
        </>
      )}
      {evidence ? (
        <div
          style={{
            marginTop: '6px',
            paddingTop: '5px',
            borderTop: '1px solid #e4e4e4',
            color: '#666',
          }}
        >
          {evidence.summary.facts} · {evidence.summary.urkunde}{' '}
          {labels.bucket.urkunde} · {evidence.summary.zweitzeuge}{' '}
          {labels.bucket.zweitzeuge} · {evidence.summary.hinweis}{' '}
          {labels.bucket.hinweis} · {evidence.summary.ohne} {labels.bucket.ohne}
        </div>
      ) : null}
    </div>
  );
}
