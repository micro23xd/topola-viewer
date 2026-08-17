/**
 * How are these two related?
 *
 * One half of the pair is simply whoever is selected, so it moves as you click;
 * the other is picked here and held. Walking up a line therefore re-reads the
 * verdict at every step, which is the point: a man and his wife may be fifth
 * cousins, and his grandmother and that same wife something else again. The
 * chain rows are the way to walk between the two readings.
 *
 * The arithmetic is all in `util/kinship.ts` and the words in
 * `util/kinship_labels.ts`; this file only lays them out.
 */

import {useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Accordion, Button, Header, Icon, Item, Label} from 'semantic-ui-react';
import {PersonPicker} from '../../menu/person_picker';
import {getCurrentEvidence} from '../../util/evidence';
import {evidenceLabels} from '../../util/evidence_labels';
import {GedcomData, getName, TopolaData} from '../../util/gedcom_util';
import {CommonAncestor, kinship, Path} from '../../util/kinship';
import {KinshipLabels, kinshipLabels, Sex} from '../../util/kinship_labels';
import {ancestorsOf} from '../../util/research_index';
import {BUCKET_COLOR} from '../details/evidence-card';

interface Props {
  data: TopolaData;
  /** Person A: the selection, live. */
  indi: string;
  /** Person B: picked here and held. */
  relationB?: string;
  onRelationBChange: (id?: string) => void;
  /**
   * Opens a person in the Info tab, which is what makes them person A. It must
   * not re-root the chart: walking a line is the gesture this tab is built
   * around, and a chart that jumped to a new root at every step would throw
   * away the picture the walk is being read against.
   */
  onOpenIndi: (id: string) => void;
  /** Re-roots the chart. Only the button that says so uses this. */
  onSelectIndi: (id: string) => void;
  /** The person the ancestor network is drawn from, when that is the view. */
  networkRoot?: string;
}

const MUTED = {color: '#666'};

function yearOf(gedcom: GedcomData, id: string, tag: string): string {
  const date = gedcom.indis[id]?.tree
    .find((entry) => entry.tag === tag)
    ?.tree.find((entry) => entry.tag === 'DATE')?.data;
  return date?.match(/\d{3,4}/)?.[0] ?? '';
}

function nameOf(gedcom: GedcomData, id: string, unknown: string): string {
  return getName(gedcom.indis[id]) || unknown;
}

function lifeOf(gedcom: GedcomData, id: string): string {
  const birth = yearOf(gedcom, id, 'BIRT') || yearOf(gedcom, id, 'CHR');
  const death = yearOf(gedcom, id, 'DEAT') || yearOf(gedcom, id, 'BURI');
  return birth || death ? `${birth}–${death}` : '';
}

function sexOfIn(gedcom: GedcomData): (id: string) => Sex {
  return (id) => {
    const sex = gedcom.indis[id]?.tree.find(
      (entry) => entry.tag === 'SEX',
    )?.data;
    return sex === 'M' || sex === 'F' ? sex : undefined;
  };
}

/** The couple a family holds, as "he ⚭ she". */
function coupleOf(gedcom: GedcomData, famId: string, unknown: string): string {
  const spouses = (gedcom.fams[famId]?.tree ?? [])
    .filter(
      (entry) => (entry.tag === 'HUSB' || entry.tag === 'WIFE') && entry.data,
    )
    .map((entry) => (entry.data as string).slice(1, -1))
    .map((id) => nameOf(gedcom, id, unknown));
  return spouses.join(' ⚭ ');
}

function StateDot({gedcom, id}: {gedcom: GedcomData; id: string}) {
  void gedcom;
  const person = getCurrentEvidence()?.persons.get(id);
  return (
    <span
      style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        flex: '0 0 auto',
        background: person ? BUCKET_COLOR[person.state] : '#c8c8c8',
      }}
    />
  );
}

/** One line of descent, read downwards from the ancestor to the person. */
function Chain({
  gedcom,
  from,
  path,
  title,
  labels,
  onOpenIndi,
}: {
  gedcom: GedcomData;
  from: string;
  path: Path;
  title: string;
  labels: KinshipLabels;
  onOpenIndi: (id: string) => void;
}) {
  const intl = useIntl();
  const evidence = getCurrentEvidence();
  const facts = evidenceLabels(intl.locale);
  const rows = [
    {id: from, famId: undefined as string | undefined, adopted: false},
  ].concat(
    path.steps.map((step) => ({
      id: step.id,
      famId: step.famId,
      adopted: step.adopted,
    })),
  );

  return (
    <div style={{marginBottom: '8px'}}>
      <Header sub>{title}</Header>
      {rows.map((row, index) => {
        const marriage = row.famId
          ? evidence?.families
              .get(row.famId)
              ?.find((fact) => fact.tag === 'MARR')
          : undefined;
        return (
          <div key={`${row.id}-${index}`} style={{padding: '1px 0'}}>
            {row.famId ? (
              <div style={{...MUTED, fontSize: '0.85em', paddingLeft: '14px'}}>
                ↑ {marriage ? facts.bucket[marriage.bucket] : facts.notRecorded}
                {row.adopted ? ` · ${labels.adopted}` : ''}
              </div>
            ) : null}
            <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              <StateDot gedcom={gedcom} id={row.id} />
              <a onClick={() => onOpenIndi(row.id)} style={{cursor: 'pointer'}}>
                {nameOf(gedcom, row.id, labels.unknownName)}
              </a>
              <span style={{...MUTED, fontSize: '0.85em'}}>
                {lifeOf(gedcom, row.id)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AncestorLine({
  gedcom,
  ancestor,
  labels,
  onOpenIndi,
}: {
  gedcom: GedcomData;
  ancestor: CommonAncestor;
  labels: KinshipLabels;
  onOpenIndi: (id: string) => void;
}) {
  return (
    <div style={{padding: '1px 0'}}>
      <a onClick={() => onOpenIndi(ancestor.id)} style={{cursor: 'pointer'}}>
        {nameOf(gedcom, ancestor.id, labels.unknownName)}
      </a>{' '}
      <span style={MUTED}>
        {lifeOf(gedcom, ancestor.id)} ·{' '}
        {labels.generationsPair(ancestor.up[0], ancestor.up[1])}
        {ancestor.lines > 1
          ? ` · ${labels.linesOfDescent(ancestor.lines)}`
          : ''}
      </span>
    </div>
  );
}

export function RelationsTab({
  data,
  indi,
  relationB,
  onRelationBChange,
  onOpenIndi,
  onSelectIndi,
  networkRoot,
}: Props) {
  const intl = useIntl();
  const labels = kinshipLabels(intl.locale);
  const gedcom = data.gedcom;
  const sexOf = useMemo(() => sexOfIn(gedcom), [gedcom]);
  const [showOthers, setShowOthers] = useState(false);

  const result = useMemo(
    () =>
      relationB && gedcom.indis[relationB] && gedcom.indis[indi]
        ? kinship(gedcom, indi, relationB)
        : undefined,
    [gedcom, indi, relationB],
  );

  // The network draws the root's ancestors only, so the path lights up there
  // only when the whole of both lines is on it.
  const onNetwork = useMemo(() => {
    if (!networkRoot || !result?.best) return undefined;
    const above = ancestorsOf(gedcom, networkRoot);
    const people = [
      indi,
      relationB as string,
      ...result.best.fromA.steps.map((step) => step.id),
      ...result.best.fromB.steps.map((step) => step.id),
    ];
    return people.every((id) => above.has(id));
  }, [gedcom, networkRoot, result, indi, relationB]);

  const nameA = nameOf(gedcom, indi, labels.unknownName);
  const nameB = relationB
    ? nameOf(gedcom, relationB, labels.unknownName)
    : undefined;

  return (
    <div className="details" data-testid="relations">
      <Item.Group divided>
        <Item>
          <Item.Content>
            <Header sub>{labels.personA}</Header>
            <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
              <StateDot gedcom={gedcom} id={indi} />
              <span>{nameA}</span>
              <span style={{...MUTED, fontSize: '0.85em'}}>
                {lifeOf(gedcom, indi)}
              </span>
            </div>
          </Item.Content>
        </Item>

        <Item>
          <Item.Content>
            <Header sub>{labels.personB}</Header>
            {relationB ? (
              <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                <StateDot gedcom={gedcom} id={relationB} />
                <a
                  onClick={() => onOpenIndi(relationB)}
                  style={{cursor: 'pointer'}}
                >
                  {nameB}
                </a>
                <span style={{...MUTED, fontSize: '0.85em'}}>
                  {lifeOf(gedcom, relationB)}
                </span>
                <Button
                  size="mini"
                  compact
                  basic
                  icon
                  title={labels.swap}
                  onClick={() => {
                    onRelationBChange(indi);
                    onOpenIndi(relationB);
                  }}
                >
                  <Icon name="exchange" />
                </Button>
                <Button
                  size="mini"
                  compact
                  basic
                  icon
                  title={labels.clear}
                  onClick={() => onRelationBChange(undefined)}
                >
                  <Icon name="close" />
                </Button>
              </div>
            ) : null}
            <div style={{marginTop: '4px'}}>
              <PersonPicker
                data={data.chartData}
                placeholder={labels.pick}
                onSelect={(id) => onRelationBChange(id)}
              />
            </div>
          </Item.Content>
        </Item>

        {!result ? (
          <Item>
            <Item.Content>
              <div style={MUTED}>{labels.empty}</div>
            </Item.Content>
          </Item>
        ) : null}

        {result && result.kind === 'same' ? (
          <Item>
            <Item.Content>
              <div>{labels.same}</div>
            </Item.Content>
          </Item>
        ) : null}

        {result && result.kind === 'none' ? (
          <Item>
            <Item.Content>
              <div>{labels.none}</div>
            </Item.Content>
          </Item>
        ) : null}

        {result && result.bridge ? (
          <Item>
            <Item.Content>
              <Header sub>{labels.bridgeHeader}</Header>
              <div style={{marginBottom: '6px'}}>
                {labels.sentence(
                  nameA,
                  labels.term(result, sexOf(indi)),
                  nameB as string,
                )}
              </div>
              {result.bridge.map((hop, index) => (
                <div
                  key={`${hop.id}-${index}`}
                  style={{display: 'flex', alignItems: 'center', gap: '6px'}}
                >
                  <span style={{...MUTED, minWidth: '6em'}}>
                    {labels.bridge[hop.via]}
                  </span>
                  <a
                    onClick={() => onOpenIndi(hop.id)}
                    style={{cursor: 'pointer'}}
                  >
                    {nameOf(gedcom, hop.id, labels.unknownName)}
                  </a>
                </div>
              ))}
            </Item.Content>
          </Item>
        ) : null}

        {result && result.best ? (
          <Item>
            <Item.Content>
              <Header sub>{labels.header}</Header>
              <div style={{fontSize: '1.05em', marginBottom: '4px'}}>
                {labels.sentence(
                  nameA,
                  labels.term(result, sexOf(indi)),
                  nameB as string,
                )}
              </div>
              <div>
                {result.best.throughFam
                  ? labels.throughCouple
                  : labels.throughOne}{' '}
                <a
                  onClick={() => onOpenIndi(result.best?.id as string)}
                  style={{cursor: 'pointer'}}
                >
                  {nameOf(gedcom, result.best.id, labels.unknownName)}
                </a>
                {result.best.partner ? (
                  <>
                    {' ⚭ '}
                    <a
                      onClick={() => onOpenIndi(result.best?.partner as string)}
                      style={{cursor: 'pointer'}}
                    >
                      {nameOf(gedcom, result.best.partner, labels.unknownName)}
                    </a>
                  </>
                ) : null}
                <span style={MUTED}>
                  {' · '}
                  {labels.generationsPair(result.best.up[0], result.best.up[1])}
                  {result.best.lines > 1
                    ? ` · ${labels.linesOfDescent(result.best.lines)}`
                    : ''}
                </span>
              </div>
              {result.half ? (
                <div style={{marginTop: '4px'}}>
                  <div>{labels.halfNote}</div>
                  <div style={MUTED}>
                    {labels.throughMarriages}:{' '}
                    {coupleOf(
                      gedcom,
                      result.best.fromA.steps[result.best.up[0] - 1].famId,
                      labels.unknownName,
                    )}
                    {' / '}
                    {coupleOf(
                      gedcom,
                      result.best.fromB.steps[result.best.up[1] - 1].famId,
                      labels.unknownName,
                    )}
                  </div>
                </div>
              ) : null}
              {result.married ? (
                <div style={{marginTop: '4px'}}>{labels.marriedToo}</div>
              ) : null}
              {result.best.adopted ? (
                <Label size="mini" style={{marginTop: '4px'}}>
                  {labels.adopted}
                </Label>
              ) : null}
              {result.partial ? (
                <div style={{marginTop: '4px', color: '#c0392b'}}>
                  {labels.partial}
                </div>
              ) : null}
              <div style={{...MUTED, marginTop: '4px'}}>
                {labels.documented(
                  result.steps,
                  result.uncited,
                  result.weakest,
                )}
              </div>
            </Item.Content>
          </Item>
        ) : null}

        {result && result.best ? (
          <Item>
            <Item.Content>
              <Chain
                gedcom={gedcom}
                from={indi}
                path={result.best.fromA}
                title={labels.chainA}
                labels={labels}
                onOpenIndi={onOpenIndi}
              />
              <Chain
                gedcom={gedcom}
                from={relationB as string}
                path={result.best.fromB}
                title={labels.chainB}
                labels={labels}
                onOpenIndi={onOpenIndi}
              />
            </Item.Content>
          </Item>
        ) : null}

        {result && result.others.length ? (
          <Item>
            <Item.Content>
              <Accordion fluid>
                <Accordion.Title
                  active={showOthers}
                  onClick={() => setShowOthers(!showOthers)}
                >
                  <Icon name="dropdown" />
                  {labels.further(result.others.length, result.lines)}
                </Accordion.Title>
                <Accordion.Content active={showOthers}>
                  {result.others.map((ancestor) => (
                    <AncestorLine
                      key={ancestor.id}
                      gedcom={gedcom}
                      ancestor={ancestor}
                      labels={labels}
                      onOpenIndi={onOpenIndi}
                    />
                  ))}
                </Accordion.Content>
              </Accordion>
            </Item.Content>
          </Item>
        ) : null}

        {onNetwork === false && result?.best ? (
          <Item>
            <Item.Content>
              <div style={MUTED}>{labels.offNetwork}</div>
              <Button
                size="mini"
                compact
                basic
                style={{marginTop: '4px'}}
                onClick={() => onSelectIndi(result.best?.id as string)}
              >
                {labels.reroot}
              </Button>
            </Item.Content>
          </Item>
        ) : null}
      </Item.Group>
    </div>
  );
}
