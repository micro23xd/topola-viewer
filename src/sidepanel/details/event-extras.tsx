import {useState} from 'react';
import {FormattedMessage} from 'react-intl';
import {
  Icon,
  Item,
  List,
  Menu,
  MenuItemProps,
  Popup,
  Tab,
} from 'semantic-ui-react';
import {GedcomData, Source} from '../../util/gedcom_util';
import {AdditionalFiles, FileEntry} from './additional-files';
import {NoteText} from './note-text';
import {Sources} from './sources';
import {WrappedImage} from './wrapped-image';

export interface Image {
  url: string;
  filename: string;
  title?: string;
}

interface Props {
  images?: Image[];
  notes?: string[][];
  sources?: Source[];
  indi: string;
  files?: FileEntry[];
  gedcom: GedcomData;
}

function eventImages(images: Image[] | undefined) {
  return (
    !!images &&
    images.map((image, index) => (
      <List key={index}>
        <List.Item>
          <WrappedImage
            url={image.url}
            filename={image.filename}
            title={image.title}
          />
        </List.Item>
      </List>
    ))
  );
}

function eventNotes(notes: string[][] | undefined, gedcom: GedcomData) {
  return (
    !!notes?.length &&
    notes.map((note, index) => (
      <div key={index}>
        <NoteText lines={note} gedcom={gedcom} />
      </div>
    ))
  );
}

export function EventExtras(props: Props) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [indi, setIndi] = useState('');

  if (!indi || indi !== props.indi) {
    setActiveIndex(-1);
    setIndi(props.indi);
  }

  function handleTabOnClick(
    _event: React.MouseEvent<HTMLAnchorElement>,
    menuItemProps: MenuItemProps,
  ) {
    menuItemProps.index !== undefined && activeIndex !== menuItemProps.index
      ? setActiveIndex(menuItemProps.index)
      : setActiveIndex(-1);
  }

  const imageTab = props.images?.length && {
    menuItem: (
      <Menu.Item fitted key="images" onClick={handleTabOnClick}>
        <Popup
          content={
            <FormattedMessage id="extras.images" defaultMessage="Images" />
          }
          size="mini"
          position="bottom center"
          trigger={<Icon circular name="camera" />}
        />
      </Menu.Item>
    ),
    render: () => <Tab.Pane>{eventImages(props.images)}</Tab.Pane>,
  };

  const filesTab = props.files?.length && {
    menuItem: (
      <Menu.Item fitted key="files" onClick={handleTabOnClick}>
        <Popup
          content={
            <FormattedMessage
              id="extras.files"
              defaultMessage="Additional files"
            />
          }
          size="mini"
          position="bottom center"
          trigger={<Icon circular name="file alternate outline" />}
        />
      </Menu.Item>
    ),
    render: () => (
      <Tab.Pane>
        <AdditionalFiles files={props.files} />
      </Tab.Pane>
    ),
  };

  const panes = [imageTab, filesTab].flatMap((tab) => (tab ? [tab] : []));

  // What the entry says and what it rests on are the point of the record, not
  // an attachment to it, so both are always open — an event note is where the
  // witnesses and the dispensation are written down. Images and additional
  // files stay behind the tab strip.
  const written =
    props.notes?.length || props.sources?.length ? (
      <Item.Description className="event-citations">
        {eventNotes(props.notes, props.gedcom)}
        <Sources sources={props.sources} />
      </Item.Description>
    ) : null;

  if (panes.length) {
    return (
      <>
        {written}
        <Item.Description>
          <Tab
            className="event-extras"
            activeIndex={activeIndex}
            renderActiveOnly={true}
            menu={{
              tabular: true,
              attached: true,
              compact: true,
              borderless: true,
            }}
            panes={panes}
          />
        </Item.Description>
      </>
    );
  }
  return written;
}
