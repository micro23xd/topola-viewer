/**
 * Turns a citation into the links that lead to the record itself.
 *
 * A GEDCOM citation says where the evidence was found — a FamilySearch ark, a
 * microfilm and image, an Arcinsys call number — but it holds no URL. The base
 * addresses belong to the repository, not to the citation, so they are read
 * from the REPO record's `WWW` and the source's `CALN`; everything else is
 * recovered from the wording of `PAGE`, which is written by hand and has to be
 * matched loosely.
 */

export interface ExtLink {
  label: string;
  url: string;
}

export interface LinkContext {
  /** `WWW` of the repository holding the source. */
  repoWww?: string;
  /** `NAME` of that repository, used as the fallback link label. */
  repoName?: string;
  /** `CALN` of the source's repository citation; for Matricula, a parish path. */
  caln?: string;
}

/** `1:1:6CYM-GVTY` and its siblings, anywhere inside the page text. */
const ARK = /\b([12]:[12](?::\d)?:[A-Z0-9]{4}-[A-Z0-9]{3,4})\b/g;

/**
 * `Film 008114127_001, Bild 97`. The image number is optional and the comma is
 * not always there.
 */
const FILM =
  /Film\s+(\d{9})(?:_\d{3})?\b[^;]{0,40}?Bild\s+(\d+)|Film\s+(\d{9})/;

/** A Matricula volume: `Traubuch 3-04, S. 66`. */
const MATRICULA_BOOK = /\b(\d-\d\d)\b/;

/** `HStAM Best. 918 Nr. 836` — the two halves of a LAGIS resolver id. */
const LAGIS = /HStAM\s+Best\.\s*(\d+)\s+Nr\.\s*(\d+)/;

function isHost(www: string | undefined, host: string) {
  return !!www && www.includes(host);
}

function join(base: string, path: string) {
  return base.endsWith('/') ? base + path : `${base}/${path}`;
}

/** The links a single citation can offer, most specific first. */
export function linksForCitation(
  citation: {page?: string},
  context: LinkContext,
): ExtLink[] {
  const links: ExtLink[] = [];
  const page = citation.page ?? '';

  const arks = page.match(ARK);
  arks?.forEach((ark) => {
    links.push({
      label: 'FamilySearch-Eintrag',
      url: `https://www.familysearch.org/ark:/61903/${ark}`,
    });
  });

  const film = page.match(FILM);
  if (film) {
    const number = film[1] ?? film[3];
    // "Bild 97" is the 97th image, which the film viewer counts from zero.
    // The images of the Mainz collection are restricted from home either way;
    // the number is what makes the link useful at a FamilySearch Center.
    const image = film[2] ? `?i=${Number(film[2]) - 1}` : '';
    links.push({
      label: `Film ${number}`,
      url: `https://www.familysearch.org/search/film/${number}${image}`,
    });
  }

  if (isHost(context.repoWww, 'matricula-online.eu') && context.caln) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const base = join(context.repoWww!, context.caln);
    const book = page.match(MATRICULA_BOOK);
    links.push({
      label: book ? `Matricula ${book[1]}` : 'Matricula',
      url: book ? join(base, `${book[1]}/`) : `${base}/`,
    });
  }

  const lagis = page.match(LAGIS);
  if (lagis && isHost(context.repoWww, 'lagis.hessen.de')) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    links.push({
      label: `LAGIS ${lagis[1]}-${lagis[2]}`,
      url: `${context.repoWww}${lagis[1]}-${lagis[2]}`,
    });
  }

  // Nothing in the page text was recognised: at least offer the archive.
  if (!links.length && context.repoWww) {
    links.push({
      label: context.repoName ?? context.repoWww,
      url: context.repoWww,
    });
  }
  return links;
}

/** The FamilySearch tree person a `REFN` names, if that is what it is. */
export function linkForRefn(refn: {
  value?: string;
  type?: string;
}): ExtLink | undefined {
  if (!refn.value || !refn.type?.startsWith('FamilySearch')) return undefined;
  return {
    label: 'FamilySearch-Baum',
    url: `https://www.familysearch.org/tree/person/details/${refn.value}`,
  };
}
