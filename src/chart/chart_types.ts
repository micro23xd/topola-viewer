import {
  CircleRenderer,
  DetailedRenderer,
  FancyChart,
  HourglassChart,
  IndiInfo,
  JsonGedcomData,
  RelativesChart,
  ChartColors as TopolaChartColors,
} from 'topola';
import {
  ChartColors,
  Ids,
  NetworkOptions,
  PlaceDisplay,
  Sex,
} from '../sidepanel/config/config';
import {EvidenceCircleRenderer, EvidenceRenderer} from './evidence_renderer';
import {HoverTarget, NetworkHighlight} from './network/network_chart';

/** Supported chart types. */
export enum ChartType {
  Hourglass,
  Relatives,
  Donatso,
  Fancy,
  /** Ancestors as a graph: one box per person, however many lines reach them. */
  Network,
}

export interface ChartProps {
  data: JsonGedcomData;
  selection: IndiInfo;
  chartType: ChartType;
  onSelection: (indiInfo: IndiInfo) => void;
  onDetailSelection: (indiInfo: IndiInfo) => void;
  freezeAnimation?: boolean;
  colors?: ChartColors;
  hideIds?: Ids;
  hideSex?: Sex;
  placeDisplay?: PlaceDisplay;
  placeCount?: number;
  /** What the ancestor network draws; ignored by every other chart. */
  network?: NetworkOptions;
  /** The ancestor network reports what the pointer is over. */
  onHover?: (target: HoverTarget | undefined) => void;
  /**
   * Two lines of descent to hold lit on the ancestor network. Applied without a
   * re-render, so it may change on every click without redrawing the chart.
   */
  highlight?: NetworkHighlight;
  /** Called once after the initial D3 layout and SVG render completes. */
  onFirstRender?: () => void;
}

export const chartColors = new Map<ChartColors, TopolaChartColors>([
  [ChartColors.NO_COLOR, TopolaChartColors.NO_COLOR],
  [ChartColors.COLOR_BY_GENERATION, TopolaChartColors.COLOR_BY_GENERATION],
  [ChartColors.COLOR_BY_SEX, TopolaChartColors.COLOR_BY_SEX],
  // The evidence renderer paints the boxes itself; topola must not tint them.
  [ChartColors.COLOR_BY_EVIDENCE, TopolaChartColors.NO_COLOR],
]);

export function getChartType(chartType: ChartType) {
  switch (chartType) {
    case ChartType.Hourglass:
      return HourglassChart;
    case ChartType.Relatives:
      return RelativesChart;
    case ChartType.Fancy:
      return FancyChart;
    default:
      // Fall back to hourglass chart.
      return HourglassChart;
  }
}

export function getRendererType(chartType: ChartType, colors?: ChartColors) {
  switch (chartType) {
    case ChartType.Fancy:
      return colors === ChartColors.COLOR_BY_EVIDENCE
        ? EvidenceCircleRenderer
        : CircleRenderer;
    default:
      // The evidence renderer is a DetailedRenderer that also paints how well
      // each person is evidenced.
      return colors === ChartColors.COLOR_BY_EVIDENCE
        ? EvidenceRenderer
        : DetailedRenderer;
  }
}
