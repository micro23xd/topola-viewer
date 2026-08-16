/**
 * Renders a GEDCOM note the way it was written.
 *
 * Notes in a research file are prose, and they cross-reference: "siehe
 * @I82540600@", "@FBIE29@ trägt die Dispens". Rendered as plain text those
 * pointers are noise; rendered as links they are the reasoning made walkable.
 * A family pointer jumps to the husband — the family itself has no page — and
 * a source pointer shows the source's title rather than jumping anywhere.
 */

import {GedcomEntry} from 'parse-gedcom';
import {Popup} from 'semantic-ui-react';
import {GedcomData, pointerToId} from '../../util/gedcom_util';
import {LinkifyNewTab} from './linkify-new-tab';
import {PersonLink} from './person-link';

/** An `@I123@`, `@FBIE29@` or `@S_KB_BIEBER@` anywhere in the line. */
const XREF = /@([A-Z][A-Z0-9_]*)@/g;

interface Props {
  lines: string[];
  gedcom: GedcomData;
}

function sourceTitle(entry: GedcomEntry): string {
  const titl = entry.tree.find((sub) => sub.tag === 'TITL')?.data;
  const abbr = entry.tree.find((sub) => sub.tag === 'ABBR')?.data;
  return titl || abbr || pointerToId(entry.pointer);
}

function reference(id: string, gedcom: GedcomData): React.ReactNode {
  const indi = gedcom.indis[id];
  if (indi) {
    return <PersonLink person={indi} />;
  }
  const fam = gedcom.fams[id];
  if (fam) {
    // A family has no page of its own; its husband, or wife, stands for it.
    const spouse = fam.tree.find(
      (sub) => sub.tag === 'HUSB' || sub.tag === 'WIFE',
    );
    const person = spouse?.data
      ? gedcom.indis[pointerToId(spouse.data)]
      : undefined;
    if (person) {
      return (
        <Popup
          size="mini"
          content={id}
          trigger={
            <span>
              <PersonLink person={person} />
            </span>
          }
        />
      );
    }
    return <i>{id}</i>;
  }
  const other = gedcom.other[id];
  if (other?.tag === 'SOUR') {
    return (
      <Popup
        size="small"
        content={sourceTitle(other)}
        trigger={<i style={{borderBottom: '1px dotted #999'}}>{id}</i>}
      />
    );
  }
  return <>{`@${id}@`}</>;
}

/** One line, with every cross-reference in it turned into a link. */
function renderLine(line: string, gedcom: GedcomData): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  XREF.lastIndex = 0;
  while ((match = XREF.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(
        <LinkifyNewTab key={`t${last}`}>
          {line.substring(last, match.index)}
        </LinkifyNewTab>,
      );
    }
    parts.push(
      <span key={`r${match.index}`}>{reference(match[1], gedcom)}</span>,
    );
    last = match.index + match[0].length;
  }
  if (!parts.length) {
    return <LinkifyNewTab>{line}</LinkifyNewTab>;
  }
  if (last < line.length) {
    parts.push(
      <LinkifyNewTab key={`t${last}`}>{line.substring(last)}</LinkifyNewTab>,
    );
  }
  return <>{parts}</>;
}

export function NoteText({lines, gedcom}: Props) {
  return (
    <>
      {lines.map((line, index) =>
        line.trim() === '' ? (
          <div key={index} style={{height: '0.6em'}} />
        ) : (
          <div key={index}>
            <i>{renderLine(line, gedcom)}</i>
          </div>
        ),
      )}
    </>
  );
}
