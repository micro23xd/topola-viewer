import 'canvas-toBlob';
import {detect} from 'detect-browser';
import {createRoot} from 'react-dom/client';
import {IntlProvider} from 'react-intl';
import {HashRouter as Router} from 'react-router';
import 'semantic-ui-css/semantic.min.css';
import {App} from './app';
import './index.css';
import messages_bg from './translations/bg.json';
import messages_cs from './translations/cs.json';
import messages_de from './translations/de.json';
import messages_fr from './translations/fr.json';
import messages_it from './translations/it.json';
import messages_pl from './translations/pl.json';
import messages_ru from './translations/ru.json';
import messages_sv from './translations/sv.json';
import {MediaContextProvider, mediaStyles} from './util/media';

const messages: {[language: string]: {[message_id: string]: string}} = {
  bg: messages_bg,
  cs: messages_cs,
  de: messages_de,
  fr: messages_fr,
  it: messages_it,
  pl: messages_pl,
  ru: messages_ru,
  sv: messages_sv,
};
/**
 * The interface language. Normally the browser's, but a `lang=` argument in the
 * URL hash overrides it — the viewer is often opened by a script (`make view`)
 * that knows which language the tree is written in better than the browser does.
 */
function detectLanguage(): string {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.substring(hash.indexOf('?') + 1) : '';
  const lang = new URLSearchParams(query).get('lang');
  const source = lang || navigator.language || '';
  return source.split(/[-_]/)[0];
}

const language = detectLanguage();

const browser = detect();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const container = document.getElementById('root')!;
const root = createRoot(container);

if (browser && browser.name === 'ie') {
  root.render(
    <p>
      Topola Genealogy Viewer does not support Internet Explorer. Please try a
      different (modern) browser.
    </p>,
  );
} else {
  root.render(
    <IntlProvider locale={language} messages={messages[language]}>
      <MediaContextProvider>
        <style>{mediaStyles}</style>
        <Router>
          <App />
        </Router>
      </MediaContextProvider>
    </IntlProvider>,
  );
}
