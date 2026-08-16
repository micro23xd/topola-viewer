import {describe, expect, it} from '@jest/globals';
import {linkForRefn, linksForCitation} from './links';

const MATRICULA = {
  repoWww: 'https://data.matricula-online.eu/',
  repoName: 'Matricula Online',
  caln: 'de/deutschland/fulda/DE-Ful3_JCZ',
};
const LAGIS = {
  repoWww: 'https://lagis.hessen.de/resolve/de/pstr/',
  repoName: 'Personenstandsarchiv Hessen',
};
const FS = {
  repoWww: 'https://www.familysearch.org/',
  repoName: 'FamilySearch',
};

describe('linksForCitation()', () => {
  it('finds a FamilySearch record identifier in the page text', () => {
    expect(
      linksForCitation({page: 'Taufeintrag, FamilySearch 1:1:6CYM-GVTY'}, FS),
    ).toEqual([
      {
        label: 'FamilySearch-Eintrag',
        url: 'https://www.familysearch.org/ark:/61903/1:1:6CYM-GVTY',
      },
    ]);
  });

  it('links film and record when the page names both', () => {
    const links = linksForCitation(
      {
        page: 'Taufbuch S. 36/37, Film 008114121_002 Bild 46; FamilySearch 1:1:6CYM-TWVR',
      },
      FS,
    );
    expect(links.map((l) => l.url)).toEqual([
      'https://www.familysearch.org/ark:/61903/1:1:6CYM-TWVR',
      // Bild 46 is the 46th image, and the viewer counts from zero.
      'https://www.familysearch.org/search/film/008114121?i=45',
    ]);
  });

  it('links a film without an image number', () => {
    expect(
      linksForCitation({page: 'Begräbnisbuch, Film 008186221'}, FS)[0].url,
    ).toBe('https://www.familysearch.org/search/film/008186221');
  });

  it('builds a Matricula volume URL from the call number and the page', () => {
    expect(
      linksForCitation({page: 'Traubuch 3-04, S. 66, Nr. 290'}, MATRICULA),
    ).toEqual([
      {
        label: 'Matricula 3-04',
        url: 'https://data.matricula-online.eu/de/deutschland/fulda/DE-Ful3_JCZ/3-04/',
      },
    ]);
  });

  it('falls back to the parish when the page names no volume', () => {
    expect(linksForCitation({page: 'Trauung 1778'}, MATRICULA)[0].url).toBe(
      'https://data.matricula-online.eu/de/deutschland/fulda/DE-Ful3_JCZ/',
    );
  });

  it('resolves an Arcinsys call number through LAGIS', () => {
    expect(
      linksForCitation(
        {
          page: 'HStAM Best. 918 Nr. 836, Namensverzeichnis zum Sterbenebenregister Offenbach am Main 1976, S. 143',
        },
        LAGIS,
      ),
    ).toEqual([
      {
        label: 'LAGIS 918-836',
        url: 'https://lagis.hessen.de/resolve/de/pstr/918-836',
      },
    ]);
  });

  it('offers the archive itself when the page says nothing linkable', () => {
    expect(
      linksForCitation(
        {page: 'Sterbefälle 1668-1757, S. 6'},
        {
          repoWww: 'https://www.offenbach.de/stadtwerke/stadtarchiv/',
          repoName: 'Stadtarchiv Offenbach am Main',
        },
      ),
    ).toEqual([
      {
        label: 'Stadtarchiv Offenbach am Main',
        url: 'https://www.offenbach.de/stadtwerke/stadtarchiv/',
      },
    ]);
  });

  it('offers nothing when the repository has no address', () => {
    expect(linksForCitation({page: 'Grabstelle 454'}, {})).toEqual([]);
  });
});

describe('linkForRefn()', () => {
  it('links a FamilySearch tree person', () => {
    expect(linkForRefn({value: 'LYR3-B14', type: 'FamilySearch'})).toEqual({
      label: 'FamilySearch-Baum',
      url: 'https://www.familysearch.org/tree/person/details/LYR3-B14',
    });
  });

  it('ignores a reference of another kind', () => {
    expect(linkForRefn({value: '12345', type: 'Ancestry'})).toBeUndefined();
    expect(linkForRefn({value: 'LYR3-B14'})).toBeUndefined();
  });
});
