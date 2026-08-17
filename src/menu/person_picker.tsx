/**
 * A search box for picking one person, inside a panel.
 *
 * `SearchBar` in the top bar cannot be reused for this: it registers its input
 * with `use_search_shortcut`, which binds `/` globally, and a second registered
 * input would fight the first one for the key. Everything else — the lunr index,
 * the result rows — is shared, so this is the same box without the shortcut.
 */

import {useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Search} from 'semantic-ui-react';
import {JsonGedcomData} from 'topola';
import {displaySearchResult} from './search';
import {buildSearchIndex, SearchResult} from './search_index';

interface Props {
  data: JsonGedcomData;
  placeholder: string;
  onSelect: (id: string) => void;
}

export function PersonPicker({data, placeholder, onSelect}: Props) {
  const intl = useIntl();
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  return (
    <Search
      fluid
      size="mini"
      placeholder={placeholder}
      value={value}
      results={results.map((result) => displaySearchResult(result, intl))}
      selectFirstResult={true}
      noResultsMessage={intl.formatMessage({
        id: 'menu.search.no_results',
        defaultMessage: 'No results found',
      })}
      onSearchChange={(_, {value: typed}) => {
        setValue(typed || '');
        setResults(typed ? index.search(typed) : []);
      }}
      onResultSelect={(_, {result}) => {
        setValue('');
        setResults([]);
        onSelect(result.id);
      }}
    />
  );
}
