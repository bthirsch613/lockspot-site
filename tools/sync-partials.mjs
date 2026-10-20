// Rewrites the shared header and footer in every page, between the <!-- shared:header --> and
// <!-- shared:footer --> markers. No dependencies; the site itself needs no build step.
//   node tools/sync-partials.mjs
// Edit the templates below, run this, commit the pages. 404.html uses absolute paths because
// GitHub Pages serves it at any depth.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_STORE = 'https://apps.apple.com/app/id6824683190';

// key: page id, root: prefix to the site root, home: link to the home page
const PAGES = [
  { file: 'index.html', key: 'home', root: '', home: './' },
  { file: 'privacy/index.html', key: 'privacy', root: '../', home: '../' },
  { file: 'terms/index.html', key: 'terms', root: '../', home: '../' },
  { file: 'support/index.html', key: 'support', root: '../', home: '../' },
  { file: 'accessibility/index.html', key: 'accessibility', root: '../', home: '../' },
  { file: 'licenses/index.html', key: 'licenses', root: '../', home: '../' },
  { file: '404.html', key: '404', root: '/', home: '/' },
];

const wordmark = (home) =>
  `<a class="wordmark" href="${home}" aria-label="Lockspot home"><span class="wordmark__tile" aria-hidden="true"></span><span aria-hidden="true">lockspot</span></a>`;

function header({ key, root, home }) {
  const cur = (k) => (k === key ? ' aria-current="page"' : '');
  const how = key === 'home' ? '#how' : `${home}#how`;
  return `<a class="skip" href="#main">Skip to content</a>
<div class="sentinel" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap site-header__inner">
    ${wordmark(home)}
    <nav class="site-nav" aria-label="Main">
      <a class="nav-how" href="${how}">How it works</a>
      <a class="hide-sm" href="${root}privacy/"${cur('privacy')}>Privacy</a>
      <a class="hide-sm" href="${root}support/"${cur('support')}>Support</a>
      <a class="btn btn--primary btn--sm header-get if-launched" href="${APP_STORE}" aria-label="Get Lockspot on the App Store"><span class="hide-sm">Get Lockspot</span><span class="show-sm">Get</span></a>
    </nav>
  </div>
</header>`;
}

function footer({ key, root, home }) {
  const cur = (k) => (k === key ? ' aria-current="page"' : '');
  const links = [
    ['home', home, 'Home'],
    ['privacy', `${root}privacy/`, 'Privacy'],
    ['terms', `${root}terms/`, 'Terms'],
    ['support', `${root}support/`, 'Support'],
    ['accessibility', `${root}accessibility/`, 'Accessibility'],
    ['licenses', `${root}licenses/`, 'Licenses'],
  ]
    .map(([k, href, label]) => `          <li><a href="${href}"${cur(k)}>${label}</a></li>`)
    .join('\n');
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div>
        ${wordmark(home)}
        <p class="tag">Draw a zone. Lock in.</p>
        <p>Lockspot is made by Benjamin Hirsch.</p>
      </div>
      <nav aria-label="Footer">
        <ul class="foot-links">
${links}
        </ul>
      </nav>
      <div>
        <p>This site sets no cookies and runs no analytics.</p>
        <p class="if-prelaunch">Apple and iPhone are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.</p>
        <p class="if-launched">Apple, the Apple logo and iPhone are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.</p>
        <p>Lockspot is not affiliated with or endorsed by Apple Inc.</p>
      </div>
    </div>
    <p class="copy">&copy; 2026 Benjamin Hirsch</p>
  </div>
</footer>`;
}

const swap = (html, name, body) => {
  const re = new RegExp(`<!-- shared:${name} -->[\\s\\S]*?<!-- /shared:${name} -->`);
  if (!re.test(html)) throw new Error(`missing shared:${name} markers`);
  return html.replace(re, `<!-- shared:${name} -->\n${body}\n<!-- /shared:${name} -->`);
};

for (const page of PAGES) {
  const path = join(site, page.file);
  const before = readFileSync(path, 'utf8');
  const after = swap(swap(before, 'header', header(page)), 'footer', footer(page));
  if (after !== before) writeFileSync(path, after);
  console.log(`${after === before ? 'unchanged' : 'updated  '} ${page.file}`);
}
