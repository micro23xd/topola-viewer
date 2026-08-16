/**
 * The Ahnennetz's own display switches, on the chart rather than in the
 * settings panel.
 *
 * They belong here because they only mean anything while you are looking at
 * this view, and because turning the detail down is something you do *while*
 * reading — the box grows two rows when the dots and the citation count are on,
 * and a wide ancestry is easier to take in without them.
 *
 * The state lives in the URL like every other setting, so `make view` can set
 * the defaults and a reload keeps them.
 */

import {useState} from 'react';
import {FormattedMessage} from 'react-intl';
import {Checkbox, Icon} from 'semantic-ui-react';
import {Config, Highlight, NetworkOptions} from '../../sidepanel/config/config';

interface Props {
  config: Config;
  onChange: (config: Config) => void;
}

const SWITCHES: Array<{
  key: keyof NetworkOptions;
  id: string;
  fallback: string;
}> = [
  {key: 'dots', id: 'network.controls.dots', fallback: 'Evidence dots'},
  {
    key: 'marriage',
    id: 'network.controls.marriage',
    fallback: 'Marriage on the join',
  },
  {
    key: 'citations',
    id: 'network.controls.citations',
    fallback: 'Number of citations',
  },
  {
    key: 'badges',
    id: 'network.controls.badges',
    fallback: 'Lines of descent ×n',
  },
  {key: 'compact', id: 'network.controls.compact', fallback: 'Compact'},
];

export function NetworkControls({config, onChange}: Props) {
  const [open, setOpen] = useState(true);

  const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
    marginTop: '3px',
  };

  return (
    <div
      className="network-controls"
      style={{
        background: 'rgba(255, 255, 255, 0.94)',
        border: '1px solid #d4d4d5',
        borderRadius: '4px',
        padding: '8px 10px',
        fontSize: '11px',
        lineHeight: '1.5',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevron down' : 'chevron right'} size="small" />
        <FormattedMessage
          id="network.controls.header"
          defaultMessage="Display"
        />
      </div>
      {open ? (
        <div style={{marginTop: '4px'}}>
          {SWITCHES.map((option) => (
            <div key={option.key} style={row}>
              <Checkbox
                checked={config.network[option.key]}
                onChange={() =>
                  onChange({
                    ...config,
                    network: {
                      ...config.network,
                      [option.key]: !config.network[option.key],
                    },
                  })
                }
              />
              <FormattedMessage
                id={option.id}
                defaultMessage={option.fallback}
              />
            </div>
          ))}
          <div style={{...row, marginTop: '6px'}}>
            <Checkbox
              checked={config.highlight === Highlight.OPEN_WORK}
              onChange={() =>
                onChange({
                  ...config,
                  highlight:
                    config.highlight === Highlight.OPEN_WORK
                      ? Highlight.ALL
                      : Highlight.OPEN_WORK,
                })
              }
            />
            <FormattedMessage
              id="config.highlight.OPEN_WORK"
              defaultMessage="fade what is proven"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
