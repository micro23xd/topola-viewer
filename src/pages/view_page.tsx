import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Loader, SidebarPushable, SidebarPusher} from 'semantic-ui-react';
import {IndiInfo} from 'topola';
import {Chart} from '../chart/chart';
import {
  downloadPdf,
  downloadPng,
  downloadSvg,
  printChart,
} from '../chart/chart_export';
import {ChartType} from '../chart/chart_types';
import {EvidenceLegend} from '../chart/evidence_legend';
import {HoverTarget} from '../chart/network/network_chart';
import {NetworkControls} from '../chart/network/network_controls';
import {NetworkTooltip} from '../chart/network/network_tooltip';
import {ErrorMessage, ErrorPopup} from '../components/error_display';
import {ProgressPill} from '../components/progress_pill';
import {DataSourceEnum} from '../datasource/data_source';
import {DonatsoChart} from '../donatso-chart';
import {useGenealogyLoader} from '../hooks/use_genealogy_loader';
import {useGoogleDriveAuth} from '../hooks/use_google_drive_auth';
import {useUrlState} from '../hooks/use_url_state';
import {useWebMcpBridge} from '../hooks/use_webmcp_bridge';
import {GoogleAuthModal} from '../menu/google_auth_modal';
import {TopBar} from '../menu/top_bar';
import {
  ChartColors,
  Config,
  Highlight,
  Ids,
  Sex,
} from '../sidepanel/config/config';
import {SidePanel} from '../sidepanel/side-panel';
import {analyticsEvent} from '../util/analytics';
import {computeEvidence, setCurrentEvidence} from '../util/evidence';
import {idToIndiMap, TopolaData} from '../util/gedcom_util';
import {kinship} from '../util/kinship';

export enum AppState {
  INITIAL,
  LOADING,
  ERROR,
  SHOWING_CHART,
  LOADING_MORE,
}

/**
 * Updates the chart data nodes with custom display parameters (such as hiding IDs or genders)
 * in place prior to rendering D3 canvas.
 */
function updateChartWithConfig(config: Config, data: TopolaData | undefined) {
  if (data === undefined) {
    return;
  }
  const shouldHideIds = config.id === Ids.HIDE;
  const shouldHideSex = config.sex === Sex.HIDE;
  const indiMap = idToIndiMap(data.chartData);
  indiMap.forEach((indi) => {
    indi.hideId = shouldHideIds;
    indi.hideSex = shouldHideSex;
  });
}

/**
 * ViewPage is the page component that orchestrates the genealogy chart workspace.
 * It manages asynchronous data loading, configuration parameters derived from the URL,
 * chart rendering (both D3 and Donatso), side panel settings, and Google Drive auth workflows.
 */
export function ViewPage() {
  const intl = useIntl();

  const {
    chartType,
    standalone,
    showWikiTreeMenus,
    freezeAnimation,
    showSidePanel,
    config,
    selection: urlSelection,
    detail: urlDetail,
    home: urlHome,
    onSelection,
    onDetailSelection,
    onToggleSidePanel,
    onConfigChange,
  } = useUrlState();

  // What the pointer is over in the ancestor network, for the card that says
  // what is known about them. Set on entering and leaving a box, not on every
  // move, so this costs a handful of renders rather than one per frame.
  const [hovered, setHovered] = useState<HoverTarget | undefined>(undefined);

  // Who "Dominiks Urgroßvater" is measured from. `home=` says it outright; a
  // file opened without one falls back to whoever the URL started on, and then
  // to the first person in the file. The selection is deliberately not used:
  // it moves with every click, and the watch-reload would then adopt it.
  const firstIndi = useRef<string | undefined>(undefined);
  if (firstIndi.current === undefined && urlSelection?.id) {
    firstIndi.current = urlSelection.id;
  }

  const {
    state,
    loadingStatus,
    data,
    error,
    showErrorPopup,
    sourceSpec,
    updatedSelection,
    detailIndi,
    onDismissErrorPopup,
    resetLoader,
    clearData,
    setLoadingStatus,
    displayErrorPopup,
  } = useGenealogyLoader({
    intl,
    urlSelection,
    urlDetail,
    onAuthError: useCallback((fileId) => {
      triggerAuthError(fileId);
    }, []),
  });

  const {
    showAuthModal,
    failedFileId,
    hasGoogleToken,
    setHasGoogleToken,
    onGoogleSignOut,
    triggerAuthError,
    onAuthSuccess,
    onCancel,
  } = useGoogleDriveAuth({
    onSignOut: clearData,
    onAuthSuccess: resetLoader,
  });

  useMemo(() => {
    updateChartWithConfig(config, data);
  }, [config, data]);

  // The chart renderer is created by the topola library and never sees React
  // props, so the evidence index is handed to it through a module store. This
  // has to happen while rendering, before the chart's effect runs.
  const evidence = useMemo(
    () => (data ? computeEvidence(data.gedcom) : undefined),
    [data],
  );
  useMemo(() => setCurrentEvidence(evidence), [evidence]);

  // Fading the settled people is a class on the chart, not another render pass.
  useEffect(() => {
    const chart = document.getElementById('chart');
    chart?.classList.toggle(
      'dim-settled',
      config.color === ChartColors.COLOR_BY_EVIDENCE &&
        config.highlight === Highlight.OPEN_WORK,
    );
  });

  // The two lines of descent the relations tab is showing, as a set of people
  // and a set of families for the network to light up. Computed here rather
  // than in the panel because the chart needs it whether the panel is open or
  // not, and because it must not travel through a chart re-render.
  const personA = detailIndi || updatedSelection?.id;
  const highlight = useMemo(() => {
    const b = config.relationB;
    if (
      chartType !== ChartType.Network ||
      !data ||
      !personA ||
      !b ||
      !data.gedcom.indis[b] ||
      !data.gedcom.indis[personA]
    ) {
      return undefined;
    }
    const result = kinship(data.gedcom, personA, b);
    if (!result.best) return undefined;
    const steps = [...result.best.fromA.steps, ...result.best.fromB.steps];
    return {
      people: new Set([personA, b, ...steps.map((step) => step.id)]),
      unions: new Set(steps.map((step) => step.famId)),
      endpoints: [personA, b],
      meeting: result.best.id,
    };
  }, [chartType, data, personA, config.relationB]);

  useWebMcpBridge(data, detailIndi, onSelection);

  function onPrint() {
    analyticsEvent('print');
    printChart();
  }

  async function onDownloadPdf() {
    analyticsEvent('download_pdf');
    try {
      await downloadPdf();
    } catch (e) {
      displayErrorPopup(
        intl.formatMessage({
          id: 'error.failed_pdf',
          defaultMessage:
            'Failed to generate PDF file.' +
            ' Please try with a smaller diagram or download an SVG file.',
        }),
      );
    }
  }

  async function onDownloadPng() {
    analyticsEvent('download_png');
    try {
      await downloadPng();
    } catch (e) {
      displayErrorPopup(
        intl.formatMessage({
          id: 'error.failed_png',
          defaultMessage:
            'Failed to generate PNG file.' +
            ' Please try with a smaller diagram or download an SVG file.',
        }),
      );
    }
  }

  function onDownloadSvg() {
    analyticsEvent('download_svg');
    downloadSvg();
  }

  function renderChart(selection: IndiInfo) {
    if (!data) {
      return null;
    }
    if (chartType === ChartType.Donatso) {
      return (
        <DonatsoChart
          data={data.chartData}
          selection={selection}
          onSelection={onSelection}
          onFirstRender={() => setLoadingStatus('')}
        />
      );
    }
    return (
      <Chart
        data={data.chartData}
        selection={selection}
        chartType={chartType}
        onSelection={onSelection}
        onDetailSelection={onDetailSelection}
        freezeAnimation={freezeAnimation}
        colors={config.color}
        hideIds={config.id}
        hideSex={config.sex}
        placeDisplay={config.place}
        placeCount={config.placeCount}
        network={config.network}
        highlight={highlight}
        onHover={setHovered}
        onFirstRender={() => setLoadingStatus('')}
      />
    );
  }

  function renderMainArea() {
    switch (state) {
      case AppState.SHOWING_CHART:
      case AppState.LOADING_MORE: {
        if (!data || !updatedSelection) {
          return null;
        }
        const selection = updatedSelection;
        return (
          <div id="content" data-testid="content">
            <ErrorPopup
              open={showErrorPopup}
              message={error}
              onDismiss={onDismissErrorPopup}
            />
            {state === AppState.LOADING_MORE ? (
              <Loader active size="small" className="loading-more" />
            ) : null}
            <SidebarPushable>
              <SidePanel
                data={data}
                selectedIndiId={detailIndi || selection.id}
                home={
                  urlHome ?? firstIndi.current ?? data.chartData.indis[0]?.id
                }
                networkRoot={
                  chartType === ChartType.Network ? selection.id : undefined
                }
                config={config}
                expanded={showSidePanel}
                onToggle={onToggleSidePanel}
                onConfigChange={onConfigChange}
                onSelectIndi={(id) =>
                  onSelection({id, generation: selection.generation})
                }
                onOpenIndi={(id) =>
                  onDetailSelection({id, generation: selection.generation})
                }
              />
              <SidebarPusher>
                {renderChart(selection)}
                {chartType === ChartType.Network ? (
                  <NetworkTooltip gedcom={data.gedcom} target={hovered} />
                ) : null}
                <div
                  className="chart-overlays"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    bottom: '12px',
                    zIndex: 5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    alignItems: 'flex-start',
                    pointerEvents: 'none',
                  }}
                >
                  {chartType === ChartType.Network ? (
                    <NetworkControls
                      config={config}
                      onChange={onConfigChange}
                    />
                  ) : null}
                  {config.color === ChartColors.COLOR_BY_EVIDENCE &&
                  chartType !== ChartType.Donatso ? (
                    <EvidenceLegend
                      evidence={evidence}
                      network={chartType === ChartType.Network}
                    />
                  ) : null}
                </div>
              </SidebarPusher>
            </SidebarPushable>
          </div>
        );
      }

      case AppState.ERROR:
        return <ErrorMessage message={error || 'Unknown error'} />;

      case AppState.INITIAL:
      case AppState.LOADING:
        return <Loader active size="large" />;
    }
  }

  return (
    <>
      <ProgressPill loadingStatus={loadingStatus} state={state} />
      <TopBar
        data={data?.chartData}
        allowAllRelativesChart={sourceSpec?.source !== DataSourceEnum.WIKITREE}
        allowPrintAndDownload={chartType !== ChartType.Donatso}
        showingChart={
          state === AppState.SHOWING_CHART || state === AppState.LOADING_MORE
        }
        standalone={standalone}
        eventHandlers={{
          onSelection,
          onPrint,
          onDownloadPdf,
          onDownloadPng,
          onDownloadSvg,
        }}
        showWikiTreeMenus={
          sourceSpec?.source === DataSourceEnum.WIKITREE && showWikiTreeMenus
        }
        hasGoogleToken={hasGoogleToken}
        onGoogleSignOut={onGoogleSignOut}
        onGoogleTokenAcquired={() => setHasGoogleToken(true)}
      />
      {renderMainArea()}
      {showAuthModal && failedFileId && (
        <GoogleAuthModal
          failedFileId={failedFileId}
          onAuthSuccess={onAuthSuccess}
          onCancel={onCancel}
        />
      )}
    </>
  );
}
