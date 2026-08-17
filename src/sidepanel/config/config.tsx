import {ParsedQuery} from 'query-string';
import {FormattedMessage} from 'react-intl';
import {Checkbox, Form, Header, Input, Item} from 'semantic-ui-react';
import {GedcomData} from '../../util/gedcom_util';
import {DEFAULT_PLACE_DISPLAY_COUNT, PlaceDisplay} from '../../util/place_util';
import {SourceHead} from '../head/head';

export {PlaceDisplay};

export enum ChartColors {
  NO_COLOR,
  COLOR_BY_SEX,
  COLOR_BY_GENERATION,
  /** By how well each person is evidenced. See util/evidence.ts. */
  COLOR_BY_EVIDENCE,
}

export enum Ids {
  HIDE,
  SHOW,
}

export enum Sex {
  HIDE,
  SHOW,
}

/** What the chart emphasises while colouring by evidence. */
export enum Highlight {
  /** Everyone at full strength. */
  ALL,
  /** Fade what is already proven, so only the open work stands out. */
  OPEN_WORK,
}

/**
 * What the ancestor network draws. Every one of these is a checkbox on the
 * chart itself rather than in this panel, because they only mean anything while
 * you are looking at that view.
 */
export interface NetworkOptions {
  /** A dot per fact, coloured by that fact's own QUAY. */
  dots: boolean;
  /** Colour the node joining a couple by the marriage's evidence. */
  marriage: boolean;
  /** "3 Belege" on the box. */
  citations: boolean;
  /** The x3 badge on someone a pedigree chart would draw three times. */
  badges: boolean;
  /** Names only, to fit the shape of a large ancestry on one screen. */
  compact: boolean;
}

export const DEFAULT_NETWORK_OPTIONS: NetworkOptions = {
  dots: true,
  marriage: true,
  citations: true,
  badges: true,
  compact: false,
};

export interface Config {
  color: ChartColors;
  /**
   * The person the relations tab compares against, held while the selection
   * moves. The other half of the pair is whoever is selected, so only this one
   * needs remembering.
   */
  relationB?: string;
  highlight: Highlight;
  id: Ids;
  sex: Sex;
  place: PlaceDisplay;
  placeCount: number;
  network: NetworkOptions;
}

export const DEFALUT_CONFIG: Config = {
  color: ChartColors.COLOR_BY_GENERATION,
  highlight: Highlight.ALL,
  id: Ids.SHOW,
  sex: Sex.SHOW,
  place: PlaceDisplay.FULL,
  placeCount: DEFAULT_PLACE_DISPLAY_COUNT,
  network: DEFAULT_NETWORK_OPTIONS,
};

const COLOR_ARG = new Map<string, ChartColors>([
  ['n', ChartColors.NO_COLOR],
  ['g', ChartColors.COLOR_BY_GENERATION],
  ['s', ChartColors.COLOR_BY_SEX],
  ['e', ChartColors.COLOR_BY_EVIDENCE],
]);
const COLOR_ARG_INVERSE = new Map<ChartColors, string>();
COLOR_ARG.forEach((v, k) => COLOR_ARG_INVERSE.set(v, k));

const HIGHLIGHT_ARG = new Map<string, Highlight>([
  ['a', Highlight.ALL],
  ['o', Highlight.OPEN_WORK],
]);
const HIGHLIGHT_ARG_INVERSE = new Map<Highlight, string>();
HIGHLIGHT_ARG.forEach((v, k) => HIGHLIGHT_ARG_INVERSE.set(v, k));

const ID_ARG = new Map<string, Ids>([
  ['h', Ids.HIDE],
  ['s', Ids.SHOW],
]);
const ID_ARG_INVERSE = new Map<Ids, string>();
ID_ARG.forEach((v, k) => ID_ARG_INVERSE.set(v, k));

const SEX_ARG = new Map<string, Sex>([
  ['h', Sex.HIDE],
  ['s', Sex.SHOW],
]);
const SEX_ARG_INVERSE = new Map<Sex, string>();
SEX_ARG.forEach((v, k) => SEX_ARG_INVERSE.set(v, k));

const PLACE_ARG = new Map<string, PlaceDisplay>([
  ['f', PlaceDisplay.FULL],
  ['s', PlaceDisplay.SHORT],
  ['h', PlaceDisplay.HIDE],
]);
const PLACE_ARG_INVERSE = new Map<PlaceDisplay, string>();
PLACE_ARG.forEach((v, k) => PLACE_ARG_INVERSE.set(v, k));

/** `nw=dmcb`: one letter per switch, so five options cost one argument. */
const NETWORK_ARG: Array<[keyof NetworkOptions, string]> = [
  ['dots', 'd'],
  ['marriage', 'm'],
  ['citations', 'c'],
  ['badges', 'b'],
  ['compact', 'k'],
];

function argToNetwork(arg: string | undefined): NetworkOptions {
  if (arg === undefined) return DEFAULT_NETWORK_OPTIONS;
  const on = new Set(arg.split(''));
  return NETWORK_ARG.reduce(
    (options, [key, letter]) => ({...options, [key]: on.has(letter)}),
    {} as NetworkOptions,
  );
}

function networkToArg(options: NetworkOptions): string {
  // "-" rather than "" for nothing switched on: an empty value does not
  // reliably survive a query string, and everything-off has to be sayable.
  return (
    NETWORK_ARG.filter(([key]) => options[key])
      .map(([, letter]) => letter)
      .join('') || '-'
  );
}

export function argsToConfig(args: ParsedQuery<unknown>): Config {
  const getParam = (name: string) => {
    const value = args[name];
    return typeof value === 'string' ? value : undefined;
  };

  const placeCount = parseInt(getParam('pn') ?? '', 10);
  return {
    color: COLOR_ARG.get(getParam('c') ?? '') ?? DEFALUT_CONFIG.color,
    highlight:
      HIGHLIGHT_ARG.get(getParam('hl') ?? '') ?? DEFALUT_CONFIG.highlight,
    id: ID_ARG.get(getParam('i') ?? '') ?? DEFALUT_CONFIG.id,
    sex: SEX_ARG.get(getParam('s') ?? '') ?? DEFALUT_CONFIG.sex,
    place: PLACE_ARG.get(getParam('p') ?? '') ?? DEFALUT_CONFIG.place,
    placeCount: placeCount >= 1 ? placeCount : DEFALUT_CONFIG.placeCount,
    network: argToNetwork(getParam('nw')),
    relationB: getParam('rel') || undefined,
  };
}

/**
 * The settings as URL arguments.
 *
 * An argument left at its default is written as `null` rather than left out.
 * `getUrlForArgs` merges what it is given into the query that is already there
 * and only deletes on an explicit null, so omitting a key does not clear it —
 * it keeps whatever was there before. A setting that is only *written* when it
 * differs from the default can then be turned off and never back on, because
 * the stale argument outlives the change that should have removed it.
 */
export function configToArgs(config: Config): ParsedQuery {
  const result: ParsedQuery = {};
  const color = COLOR_ARG_INVERSE.get(config.color);
  result.c = color ?? null;
  const highlight = HIGHLIGHT_ARG_INVERSE.get(config.highlight);
  result.hl =
    highlight && config.highlight !== DEFALUT_CONFIG.highlight
      ? highlight
      : null;
  const id = ID_ARG_INVERSE.get(config.id);
  result.i = id ?? null;
  const sex = SEX_ARG_INVERSE.get(config.sex);
  result.s = sex ?? null;
  const network = networkToArg(config.network);
  result.nw =
    network !== networkToArg(DEFAULT_NETWORK_OPTIONS) ? network : null;
  const place = PLACE_ARG_INVERSE.get(config.place);
  result.p = place && config.place !== PlaceDisplay.FULL ? place : null;
  result.pn =
    config.place === PlaceDisplay.SHORT &&
    config.placeCount !== DEFALUT_CONFIG.placeCount
      ? String(config.placeCount)
      : null;
  result.rel = config.relationB ?? null;
  return result;
}

export function ConfigPanel(props: {
  gedcom: GedcomData;
  config: Config;
  onChange: (config: Config) => void;
}) {
  return (
    <Form className="details">
      <Item.Group>
        {SourceHead(props.gedcom)}
        <Item>
          <Item.Content>
            <Header sub>
              <FormattedMessage id="config.colors" defaultMessage="Colors" />
            </Header>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.colors.NO_COLOR"
                    defaultMessage="none"
                  />
                }
                name="checkboxRadioGroup"
                value="none"
                checked={props.config.color === ChartColors.NO_COLOR}
                onClick={() =>
                  props.onChange({
                    ...props.config,
                    color: ChartColors.NO_COLOR,
                  })
                }
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.colors.COLOR_BY_GENERATION"
                    defaultMessage="by generation"
                  />
                }
                name="checkboxRadioGroup"
                value="generation"
                checked={props.config.color === ChartColors.COLOR_BY_GENERATION}
                onClick={() =>
                  props.onChange({
                    ...props.config,
                    color: ChartColors.COLOR_BY_GENERATION,
                  })
                }
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.colors.COLOR_BY_SEX"
                    defaultMessage="by sex"
                  />
                }
                name="checkboxRadioGroup"
                value="gender"
                checked={props.config.color === ChartColors.COLOR_BY_SEX}
                onClick={() =>
                  props.onChange({
                    ...props.config,
                    color: ChartColors.COLOR_BY_SEX,
                  })
                }
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.colors.COLOR_BY_EVIDENCE"
                    defaultMessage="by evidence"
                  />
                }
                name="checkboxRadioGroup"
                value="evidence"
                checked={props.config.color === ChartColors.COLOR_BY_EVIDENCE}
                onClick={() =>
                  props.onChange({
                    ...props.config,
                    color: ChartColors.COLOR_BY_EVIDENCE,
                  })
                }
              />
            </Form.Field>
            {props.config.color === ChartColors.COLOR_BY_EVIDENCE ? (
              <Form.Field className="no-margin" style={{marginTop: '6px'}}>
                <Checkbox
                  label={
                    <FormattedMessage
                      tagName="label"
                      id="config.highlight.OPEN_WORK"
                      defaultMessage="fade what is proven"
                    />
                  }
                  checked={props.config.highlight === Highlight.OPEN_WORK}
                  onChange={() =>
                    props.onChange({
                      ...props.config,
                      highlight:
                        props.config.highlight === Highlight.OPEN_WORK
                          ? Highlight.ALL
                          : Highlight.OPEN_WORK,
                    })
                  }
                />
              </Form.Field>
            ) : null}
          </Item.Content>
        </Item>
        <Item>
          <Item.Content>
            <Header sub>
              <FormattedMessage id="config.ids" defaultMessage="IDs" />
            </Header>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.ids.HIDE"
                    defaultMessage="hide"
                  />
                }
                name="checkboxRadioGroup"
                value="hide"
                checked={props.config.id === Ids.HIDE}
                onClick={() => props.onChange({...props.config, id: Ids.HIDE})}
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.ids.SHOW"
                    defaultMessage="show"
                  />
                }
                name="checkboxRadioGroup"
                value="show"
                checked={props.config.id === Ids.SHOW}
                onClick={() => props.onChange({...props.config, id: Ids.SHOW})}
              />
            </Form.Field>
          </Item.Content>
        </Item>
        <Item>
          <Item.Content>
            <Header sub>
              <FormattedMessage id="config.sex" defaultMessage="Sex" />
            </Header>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.sex.HIDE"
                    defaultMessage="hide"
                  />
                }
                name="checkboxRadioGroup"
                value="hide"
                checked={props.config.sex === Sex.HIDE}
                onClick={() => props.onChange({...props.config, sex: Sex.HIDE})}
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.sex.SHOW"
                    defaultMessage="show"
                  />
                }
                name="checkboxRadioGroup"
                value="show"
                checked={props.config.sex === Sex.SHOW}
                onClick={() => props.onChange({...props.config, sex: Sex.SHOW})}
              />
            </Form.Field>
          </Item.Content>
        </Item>
        <Item>
          <Item.Content>
            <Header sub>
              <FormattedMessage id="config.places" defaultMessage="Places" />
            </Header>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.places.HIDE"
                    defaultMessage="hide"
                  />
                }
                name="checkboxRadioGroup"
                value="hide"
                checked={props.config.place === PlaceDisplay.HIDE}
                onClick={() =>
                  props.onChange({...props.config, place: PlaceDisplay.HIDE})
                }
              />
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.places.SHORT"
                    defaultMessage="short"
                  />
                }
                name="checkboxRadioGroup"
                value="short"
                checked={props.config.place === PlaceDisplay.SHORT}
                onClick={() =>
                  props.onChange({...props.config, place: PlaceDisplay.SHORT})
                }
              />
              {props.config.place === PlaceDisplay.SHORT && (
                <Input
                  type="number"
                  min={1}
                  max={10}
                  size="mini"
                  style={{width: '4em', marginLeft: '1.5em'}}
                  value={props.config.placeCount}
                  onChange={(_e, {value}) => {
                    const n = parseInt(value, 10);
                    if (n >= 1) {
                      props.onChange({...props.config, placeCount: n});
                    }
                  }}
                />
              )}
            </Form.Field>
            <Form.Field className="no-margin">
              <Checkbox
                radio
                label={
                  <FormattedMessage
                    tagName="label"
                    id="config.places.FULL"
                    defaultMessage="full"
                  />
                }
                name="checkboxRadioGroup"
                value="full"
                checked={props.config.place === PlaceDisplay.FULL}
                onClick={() =>
                  props.onChange({...props.config, place: PlaceDisplay.FULL})
                }
              />
            </Form.Field>
          </Item.Content>
        </Item>
      </Item.Group>
    </Form>
  );
}
