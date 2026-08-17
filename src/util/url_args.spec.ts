import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import * as H from 'history';
import {ChartType} from '../chart/chart_types';
import {DataSourceEnum} from '../datasource/data_source';
import {
  ChartColors,
  configToArgs,
  DEFALUT_CONFIG,
  DEFAULT_NETWORK_OPTIONS,
  Highlight,
  Ids,
  PlaceDisplay,
  Sex,
} from '../sidepanel/config/config';
import {
  getArguments,
  getParamFromSearch,
  getStaticUrl,
  getUrlForArgs,
} from './url_args';

describe('url_args', () => {
  const originalEnv = process.env;
  let documentMock: {
    querySelector: jest.Mock;
  };

  beforeEach(() => {
    process.env = {...originalEnv};
    // Mock document globally
    documentMock = {
      querySelector: jest.fn().mockReturnValue(null),
    };
    Object.defineProperty(global, 'document', {
      value: documentMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up document mock
    Object.defineProperty(global, 'document', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  describe('getStaticUrl', () => {
    it('returns VITE_STATIC_URL if set', () => {
      process.env.VITE_STATIC_URL = 'http://example.com/static.ged';
      expect(getStaticUrl()).toBe('http://example.com/static.ged');
    });

    it('returns meta tag url if meta tag is present and valid', () => {
      const mockMeta = {
        getAttribute: jest.fn().mockReturnValue('http://example.com/meta.ged'),
      };
      documentMock.querySelector.mockReturnValue(mockMeta);

      expect(getStaticUrl()).toBe('http://example.com/meta.ged');
      expect(documentMock.querySelector).toHaveBeenCalledWith(
        'meta[name="topola-static-url"]',
      );
      expect(mockMeta.getAttribute).toHaveBeenCalledWith('content');
    });

    it('ignores template placeholder in meta tag', () => {
      const mockMeta = {
        getAttribute: jest.fn().mockReturnValue('{{ env "STATIC_URL" }}'),
      };
      documentMock.querySelector.mockReturnValue(mockMeta);

      expect(getStaticUrl()).toBeUndefined();
    });

    it('ignores __ placeholder in meta tag', () => {
      const mockMeta = {
        getAttribute: jest.fn().mockReturnValue('__STATIC_URL_PLACEHOLDER__'),
      };
      documentMock.querySelector.mockReturnValue(mockMeta);

      expect(getStaticUrl()).toBeUndefined();
    });

    it('returns undefined if neither VITE_STATIC_URL nor meta tag is present', () => {
      expect(getStaticUrl()).toBeUndefined();
    });
  });

  describe('getParamFromSearch', () => {
    it('extracts query param value', () => {
      expect(getParamFromSearch('test', {test: 'val'})).toBe('val');
    });

    it('returns undefined if param is array or missing', () => {
      expect(
        getParamFromSearch('test', {test: ['val1', 'val2']}),
      ).toBeUndefined();
      expect(getParamFromSearch('missing', {test: 'val'})).toBeUndefined();
    });
  });

  describe('getArguments', () => {
    const createLocation = (search: string): H.Location => ({
      pathname: '/view',
      search,
      hash: '',
      state: null,
      key: '',
    });

    it('returns defaults for empty search', () => {
      const args = getArguments(createLocation(''));
      expect(args.sourceSpec).toBeUndefined();
      expect(args.selection).toBeUndefined();
      expect(args.detail).toBeUndefined();
      expect(args.chartType).toBe(ChartType.Hourglass);
      expect(args.standalone).toBe(true);
      expect(args.showWikiTreeMenus).toBe(true);
      expect(args.freezeAnimation).toBe(false);
      expect(args.showSidePanel).toBe(true); // default on desktop
      expect(args.config).toEqual({
        color: ChartColors.COLOR_BY_GENERATION,
        highlight: Highlight.ALL,
        id: Ids.SHOW,
        sex: Sex.SHOW,
        place: PlaceDisplay.FULL,
        placeCount: 2,
        network: DEFAULT_NETWORK_OPTIONS,
      });
    });

    it('parses chart view types correctly', () => {
      expect(getArguments(createLocation('?view=relatives')).chartType).toBe(
        ChartType.Relatives,
      );
      expect(getArguments(createLocation('?view=fancy')).chartType).toBe(
        ChartType.Fancy,
      );
      expect(getArguments(createLocation('?view=donatso')).chartType).toBe(
        ChartType.Donatso,
      );
      expect(getArguments(createLocation('?view=unknown')).chartType).toBe(
        ChartType.Hourglass,
      );
    });

    it('parses WikiTree source spec', () => {
      const args = getArguments(
        createLocation('?source=wikitree&authcode=123'),
      );
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.WIKITREE,
        authcode: '123',
      });
    });

    it('parses Google Drive source spec', () => {
      const args = getArguments(
        createLocation('?source=google-drive&fileId=abc'),
      );
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.GOOGLE_DRIVE,
        fileId: 'abc',
      });
    });

    it('parses Uploaded source spec', () => {
      const args = getArguments(createLocation('?file=hash123'));
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.UPLOADED,
        hash: 'hash123',
      });
    });

    it('parses GEDCOM URL source spec', () => {
      const args = getArguments(
        createLocation('?url=http://example.com/tree.ged'),
      );
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.GEDCOM_URL,
        url: 'http://example.com/tree.ged',
        handleCors: true,
      });
    });

    it('parses GEDCOM URL source spec with handleCors false', () => {
      const args = getArguments(
        createLocation('?url=http://example.com/tree.ged&handleCors=false'),
      );
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.GEDCOM_URL,
        url: 'http://example.com/tree.ged',
        handleCors: false,
      });
    });

    it('parses Embedded source spec', () => {
      const args = getArguments(createLocation('?embedded=true'));
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.EMBEDDED,
      });
    });

    it('prefers staticUrl over other source specs', () => {
      process.env.VITE_STATIC_URL = 'http://example.com/static.ged';
      const args = getArguments(
        createLocation('?embedded=true&url=http://other.com'),
      );
      expect(args.sourceSpec).toEqual({
        source: DataSourceEnum.GEDCOM_URL,
        url: 'http://example.com/static.ged',
        handleCors: false,
      });
      expect(args.standalone).toBe(false);
    });

    it('parses selection correctly', () => {
      const args = getArguments(createLocation('?indi=I123&gen=4'));
      expect(args.selection).toEqual({
        id: 'I123',
        generation: 4,
      });
    });

    it('defaults selection generation to 0 if missing or invalid', () => {
      const args1 = getArguments(createLocation('?indi=I123'));
      expect(args1.selection).toEqual({
        id: 'I123',
        generation: 0,
      });

      const args2 = getArguments(createLocation('?indi=I123&gen=abc'));
      expect(args2.selection).toEqual({
        id: 'I123',
        generation: 0,
      });
    });

    it('parses detail parameter', () => {
      const args = getArguments(createLocation('?detail=I456'));
      expect(args.detail).toBe('I456');
    });

    it('parses showSidePanel setting', () => {
      // Mock window.matchMedia for desktop
      Object.defineProperty(global, 'window', {
        value: {
          matchMedia: jest.fn().mockReturnValue({matches: false}),
        },
        writable: true,
        configurable: true,
      });
      expect(getArguments(createLocation('')).showSidePanel).toBe(true);
      expect(
        getArguments(createLocation('?sidePanel=false')).showSidePanel,
      ).toBe(false);

      // Mock window.matchMedia for mobile
      Object.defineProperty(global, 'window', {
        value: {
          matchMedia: jest.fn().mockReturnValue({matches: true}),
        },
        writable: true,
        configurable: true,
      });
      expect(getArguments(createLocation('')).showSidePanel).toBe(false);
      expect(
        getArguments(createLocation('?sidePanel=true')).showSidePanel,
      ).toBe(true);
    });

    it('parses boolean settings (standalone, showWikiTreeMenus, freeze)', () => {
      const args = getArguments(
        createLocation('?standalone=false&showWikiTreeMenus=false&freeze=true'),
      );
      expect(args.standalone).toBe(false);
      expect(args.showWikiTreeMenus).toBe(false);
      expect(args.freezeAnimation).toBe(true);
    });

    it('parses config object from query parameters', () => {
      const args = getArguments(createLocation('?c=s&i=h&s=h&p=s&pn=5'));
      expect(args.config).toEqual({
        color: ChartColors.COLOR_BY_SEX,
        highlight: Highlight.ALL,
        id: Ids.HIDE,
        sex: Sex.HIDE,
        place: PlaceDisplay.SHORT,
        placeCount: 5,
        network: DEFAULT_NETWORK_OPTIONS,
      });
    });

    it('parses the evidence colouring and its highlight mode', () => {
      const args = getArguments(createLocation('?c=e&hl=o'));
      expect(args.config.color).toBe(ChartColors.COLOR_BY_EVIDENCE);
      expect(args.config.highlight).toBe(Highlight.OPEN_WORK);
    });

    it("reads the ancestor network's display switches from one argument", () => {
      expect(getArguments(createLocation('?nw=dk')).config.network).toEqual({
        dots: true,
        marriage: false,
        citations: false,
        badges: false,
        compact: true,
      });
      // Everything off has to be sayable, and must not fall back to the
      // defaults the way a missing argument does.
      expect(getArguments(createLocation('?nw=-')).config.network).toEqual({
        dots: false,
        marriage: false,
        citations: false,
        badges: false,
        compact: false,
      });
    });
  });

  describe('a setting put back to its default', () => {
    const location = (search: string): H.Location => ({
      pathname: '/view',
      search,
      hash: '',
      state: null,
      key: '',
    });

    /**
     * The round trip a checkbox makes: config -> URL -> config. getUrlForArgs
     * merges into the query that is already there, so an argument the new
     * config does not mention survives -- which used to mean a switch could be
     * turned off and never back on.
     */
    it('is cleared from the URL rather than left behind', () => {
      const from = location('?c=e&nw=mcb&hl=o&p=s&pn=5');
      const back = getArguments(
        location(getUrlForArgs(from, configToArgs(DEFALUT_CONFIG)).search),
      );
      expect(back.config.network).toEqual(DEFAULT_NETWORK_OPTIONS);
      expect(back.config.highlight).toBe(Highlight.ALL);
      expect(back.config.place).toBe(DEFALUT_CONFIG.place);
      expect(back.config.placeCount).toBe(DEFALUT_CONFIG.placeCount);
    });

    it('carries the compared person, and lets go of them again', () => {
      const from = location('?c=e');
      const search = getUrlForArgs(
        from,
        configToArgs({...DEFALUT_CONFIG, relationB: 'I42'}),
      ).search;
      expect(search).toContain('rel=I42');
      expect(getArguments(location(search)).config.relationB).toBe('I42');

      // Clearing has to remove the argument rather than merely stop writing it:
      // getUrlForArgs keeps what it is not told to delete.
      const cleared = getUrlForArgs(
        location(search),
        configToArgs(DEFALUT_CONFIG),
      ).search;
      expect(cleared).not.toContain('rel=');
      expect(getArguments(location(cleared)).config.relationB).toBeUndefined();
    });

    it('reads the home person as its own argument', () => {
      expect(getArguments(location('?indi=I1&home=I2')).home).toBe('I2');
      expect(getArguments(location('?indi=I1')).home).toBeUndefined();
    });

    it('still carries the settings that are not at their default', () => {
      const from = location('?c=g');
      const search = getUrlForArgs(
        from,
        configToArgs({
          ...DEFALUT_CONFIG,
          color: ChartColors.COLOR_BY_EVIDENCE,
          highlight: Highlight.OPEN_WORK,
          network: {...DEFAULT_NETWORK_OPTIONS, dots: false},
        }),
      ).search;
      const back = getArguments(location(search));
      expect(back.config.color).toBe(ChartColors.COLOR_BY_EVIDENCE);
      expect(back.config.highlight).toBe(Highlight.OPEN_WORK);
      expect(back.config.network.dots).toBe(false);
      expect(back.config.network.marriage).toBe(true);
    });
  });

  describe('getUrlForArgs', () => {
    const createLocation = (search: string): H.Location => ({
      pathname: '/view',
      search,
      hash: '#hash-val',
      state: null,
      key: '',
    });

    it('updates query parameter value and preserves pathname/hash', () => {
      const loc = createLocation('?param1=old&param2=keep');
      const updated = getUrlForArgs(loc, {param1: 'new', param3: 'added'});
      expect(updated).toEqual({
        pathname: '/view',
        search: '?param1=new&param2=keep&param3=added',
        hash: '#hash-val',
      });
    });

    it('deletes query parameters set to null or undefined', () => {
      const loc = createLocation('?param1=val1&param2=val2');
      const updated = getUrlForArgs(loc, {param1: null, param2: undefined});
      expect(updated).toEqual({
        pathname: '/view',
        search: '',
        hash: '#hash-val',
      });
    });
  });
});
