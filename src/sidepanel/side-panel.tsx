import {useIntl} from 'react-intl';
import {Button, Icon, Sidebar, Tab} from 'semantic-ui-react';
import {TopolaData} from '../util/gedcom_util';
import {Config, ConfigPanel} from './config/config';
import {CollapsedDetails} from './details/collapsed-details';
import {Details} from './details/details';
import {RelationsTab} from './relations/relations-tab';
import {ResearchTab} from './research/research-tab';

interface SidePanelProps {
  data: TopolaData;
  selectedIndiId: string;
  config: Config;
  onConfigChange: (config: Config) => void;
  expanded: boolean;
  onToggle: () => void;
  onSelectIndi: (id: string) => void;
  /** Shows a person in the Info tab without moving the chart. */
  onOpenIndi: (id: string) => void;
  /** The person every relationship in the Info tab is measured from. */
  home?: string;
  /** The person the ancestor network is drawn from, when that is the view. */
  networkRoot?: string;
}

export function SidePanel({
  data,
  selectedIndiId,
  config,
  onConfigChange,
  expanded,
  onToggle,
  onSelectIndi,
  onOpenIndi,
  home,
  networkRoot,
}: SidePanelProps) {
  const intl = useIntl();

  const tabs = [
    {
      menuItem: intl.formatMessage({
        id: 'tab.info',
        defaultMessage: 'Info',
      }),
      render: () => (
        <Details
          gedcom={data.gedcom}
          indi={selectedIndiId}
          config={config}
          images={data.images}
          home={home}
        />
      ),
    },
    {
      menuItem: intl.formatMessage({
        id: 'tab.relations',
        defaultMessage: 'Relationship',
      }),
      render: () => (
        <RelationsTab
          data={data}
          indi={selectedIndiId}
          relationB={config.relationB}
          onRelationBChange={(id) => onConfigChange({...config, relationB: id})}
          onOpenIndi={onOpenIndi}
          onSelectIndi={onSelectIndi}
          networkRoot={networkRoot}
        />
      ),
    },
    {
      menuItem: intl.formatMessage({
        id: 'tab.research',
        defaultMessage: 'Research',
      }),
      render: () => (
        <ResearchTab
          gedcom={data.gedcom}
          indi={selectedIndiId}
          onSelectIndi={onSelectIndi}
        />
      ),
    },
    {
      menuItem: intl.formatMessage({
        id: 'tab.settings',
        defaultMessage: 'Settings',
      }),
      render: () => (
        <ConfigPanel
          gedcom={data.gedcom}
          config={config}
          onChange={onConfigChange}
        />
      ),
    },
  ];

  return (
    <Sidebar
      id="sidebar"
      animation="overlay"
      icon="labeled"
      width={expanded ? 'wide' : 'very thin'}
      direction="right"
      visible={true}
    >
      {expanded ? (
        <Tab id="sideTabs" panes={tabs} />
      ) : (
        <CollapsedDetails gedcom={data.gedcom} indi={selectedIndiId} />
      )}
      <Button id="sideToggle" icon size="mini" onClick={() => onToggle()}>
        <Icon size="large" name={expanded ? 'arrow right' : 'arrow left'} />
      </Button>
    </Sidebar>
  );
}
