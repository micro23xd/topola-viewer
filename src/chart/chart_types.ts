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
import {ChartColors, Ids, PlaceDisplay, Sex} from '../sidepanel/config/config';
import {EvidenceRenderer} from './evidence_renderer';

/** Supported chart types. */
export enum ChartType {
  Hourglass,
  Relatives,
  Donatso,
  Fancy,
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
      return CircleRenderer;
    default:
      // The evidence renderer is a DetailedRenderer that also paints how well
      // each person is evidenced; the circle chart has no room for that yet.
      return colors === ChartColors.COLOR_BY_EVIDENCE
        ? EvidenceRenderer
        : DetailedRenderer;
  }
}
