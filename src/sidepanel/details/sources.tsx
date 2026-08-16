import {useState} from 'react';
import {useIntl} from 'react-intl';
import {Icon, Label, List} from 'semantic-ui-react';
import {formatDateOrRange} from '../../util/date_util';
import {Source} from '../../util/gedcom_util';
import {linksForCitation} from '../../util/links';
import {LinkifyNewTab} from './linkify-new-tab';
import {MultilineText} from './multiline-text';

interface Props {
  sources?: Source[];
}

/**
 * What a QUAY means, in the wording the research uses. The colours are the ones
 * the chart paints the same fact with.
 */
const TIERS: {[key: number]: {text: string; color: string}} = {
  3: {text: 'record', color: '#3a9d5d'},
  2: {text: 'secondary witness', color: '#d9a400'},
  1: {text: 'compiled tree', color: '#e07b2a'},
  0: {text: 'family memory', color: '#e07b2a'},
};

function TierBadge({quay}: {quay?: number}) {
  const intl = useIntl();
  const tier = quay !== undefined ? TIERS[quay] : undefined;
  const text = tier
    ? `${intl.formatMessage({
        id: `sources.tier.${quay}`,
        defaultMessage: tier.text,
      })} · QUAY ${quay}`
    : intl.formatMessage({
        id: 'sources.tier.none',
        defaultMessage: 'no QUAY',
      });
  return (
    <Label
      size="mini"
      style={{
        backgroundColor: tier?.color ?? '#9a9a9a',
        color: 'white',
        marginRight: '6px',
        verticalAlign: 'middle',
      }}
    >
      {text}
    </Label>
  );
}

/** What the source itself is, and how to reach it. Shown on demand. */
function SourceNote({source}: {source: Source}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  if (!source.sourceNotes.length) return null;
  return (
    <div style={{marginTop: '3px'}}>
      <a
        onClick={() => setOpen(!open)}
        style={{cursor: 'pointer', fontSize: '0.9em'}}
      >
        <Icon name={open ? 'caret down' : 'caret right'} />
        {intl.formatMessage({
          id: 'sources.about',
          defaultMessage: 'About the source',
        })}
      </a>
      {open ? (
        <div style={{color: '#666', fontSize: '0.95em', marginLeft: '1em'}}>
          <MultilineText lines={source.sourceNotes} />
        </div>
      ) : null}
    </div>
  );
}

export function Sources({sources}: Props) {
  const intl = useIntl();

  if (!sources?.length) return null;

  return (
    <List className="citations">
      {sources.map((source, index) => {
        const links = linksForCitation(source, {
          repoWww: source.repoWww,
          repoName: source.repoName,
          caln: source.caln,
        });
        return (
          <List.Item key={index}>
            <List.Content>
              <List.Header>
                <TierBadge quay={source.quay} />
                <LinkifyNewTab>
                  {[source.author, source.title, source.publicationInfo]
                    .filter((sourceElement) => !!sourceElement)
                    .join(', ')}
                </LinkifyNewTab>
              </List.Header>
              <List.Description>
                <div>
                  <LinkifyNewTab>{source.page}</LinkifyNewTab>
                  {source.date && ` [${formatDateOrRange(source.date, intl)}]`}
                </div>
                {links.length ? (
                  <div style={{marginTop: '2px'}}>
                    {links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{marginRight: '10px', whiteSpace: 'nowrap'}}
                      >
                        <Icon name="external" size="small" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                ) : null}
                {source.notes.length ? (
                  <div style={{marginTop: '3px', color: '#444'}}>
                    <MultilineText lines={source.notes} />
                  </div>
                ) : null}
                <SourceNote source={source} />
              </List.Description>
            </List.Content>
          </List.Item>
        );
      })}
    </List>
  );
}
