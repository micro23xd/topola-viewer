/**
 * What the colours on the chart mean, in the wording the research uses.
 * Shown only while the chart is coloured by evidence.
 */

import {EvidenceIndex} from '../util/evidence';

const BOXES: Array<{fill: string; label: string}> = [
  {fill: '#e3f4e1', label: 'urkundlich'},
  {fill: '#fff4d6', label: 'Zweitzeuge'},
  {fill: '#ffe0c2', label: 'nur Hinweis'},
  {fill: '#f2f2f2', label: 'ohne Quelle'},
  {fill: '#fafafa', label: 'nichts belegt'},
];

const BORDERS: Array<{stroke: string; label: string}> = [
  {stroke: '#c0392b', label: 'Eltern unbekannt'},
  {stroke: '#7d5ba6', label: 'nicht verbunden'},
];

const DOTS: Array<{fill: string; stroke?: string; label: string}> = [
  {fill: '#3a9d5d', label: 'QUAY 3'},
  {fill: '#d9a400', label: 'QUAY 2'},
  {fill: '#e07b2a', label: 'QUAY 0–1'},
  {fill: '#9a9a9a', label: 'ohne QUAY'},
  {fill: '#ffffff', stroke: '#c8c8c8', label: 'nicht erfasst'},
];

interface Props {
  evidence?: EvidenceIndex;
}

export function EvidenceLegend({evidence}: Props) {
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
        position: 'absolute',
        left: '12px',
        bottom: '12px',
        zIndex: 5,
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
      <div style={{fontWeight: 'bold', marginBottom: '4px'}}>Belege</div>
      {BOXES.map((box) => (
        <div key={box.label} style={row}>
          <span
            style={{
              width: '14px',
              height: '10px',
              background: box.fill,
              border: '1px solid #333',
              borderRadius: '2px',
            }}
          />
          {box.label}
        </div>
      ))}
      <div style={{height: '5px'}} />
      {BORDERS.map((border) => (
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
      <div style={{marginBottom: '2px'}}>Punkte: Geburt · Tod · Heirat</div>
      {DOTS.map((dot) => (
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
      {evidence ? (
        <div
          style={{
            marginTop: '6px',
            paddingTop: '5px',
            borderTop: '1px solid #e4e4e4',
            color: '#666',
          }}
        >
          {evidence.summary.facts} Fakten: {evidence.summary.urkunde}{' '}
          urkundlich, {evidence.summary.zweitzeuge} Zweitzeuge,{' '}
          {evidence.summary.hinweis} nur Hinweis, {evidence.summary.ohne} ohne
          Quelle
        </div>
      ) : null}
    </div>
  );
}
