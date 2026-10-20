# lockspot-site

The public website for Lockspot, the iPhone focus app. GitHub Pages serves it at
https://bthirsch613.github.io/lockspot-site/.

Two URLs must never move: the app's Settings screen opens `/privacy/`, and the app's share text links to the home page.

| Page | Path |
|---|---|
| Home | `index.html` |
| Privacy policy (linked from the app and App Store Connect) | `privacy/index.html` |
| Support (the App Store Connect Support URL) | `support/index.html` |
| Terms of use | `terms/index.html` |
| Accessibility statement | `accessibility/index.html` |
| Font licenses | `licenses/index.html` |
| Not found (absolute paths, because Pages serves it at any depth) | `404.html` |

## How it's built

Plain HTML, CSS and vanilla JavaScript. There's no framework and no build step, and the pages make no third-party requests.

- `assets/site.css` holds the shared styles. `assets/home.css` styles the home page, including the recreated app screens and all the motion.
- `assets/site.js` is progressive enhancement only. Every page reads and works without it. It loads with `defer`. `assets/js-flag.js` is the only script that runs before first paint: it sets the `js` class, so keep it to that one line.
- Fonts are self-hosted in `assets/fonts/`, with their OFL licenses next to them: Plus Jakarta Sans 500/600/700/800 (the app's `src/theme.ts` uses all four), and Anton for meme captions only. `tools/subset-fonts.mjs` made the Latin-subset WOFF2 files from the app repo's TTFs, using no dependencies. Anton is always drawn upper case, so it is cut with `--caps` to space through Z plus dashes, curly quotes and the ellipsis; keep `text-transform: uppercase` on anything set in Anton.
- The CSP in each page's `<meta>` allows `'self'` only and no inline styles. Don't add `style=""` attributes or inline scripts.
- The header and footer are shared. To change them, edit `tools/sync-partials.mjs`, then run `node tools/sync-partials.mjs`, which rewrites the blocks between the `<!-- shared:header -->` and `<!-- shared:footer -->` markers on every page.
- Motion: by default the CSS shows the finished state. Animations run only under `.js` with `prefers-reduced-motion: no-preference`. Scroll-linked effects use `animation-timeline: view()` where the browser supports it, and a one-time timed fallback elsewhere.
- `assets/img/og.png` (1200 x 630) was rendered from the home page's hero phone with Playwright and sharp. Only the PNG is committed.

## Social video files

`media/teaser/` holds the pre-launch social videos (end card: "Follow along.", no App Store badge). They're
here only so Metricool can fetch them by URL when it publishes a scheduled post; no page links to them.
The "Out now" cuts, which carry Apple's badge, go in `media/launch/` on launch day only, after the App
Store listing is live. They're rendered in the marketing repo (`design/lockspot-growth/ads/`).

## Launch day (one commit)

1. Confirm https://apps.apple.com/app/id6824683190 returns 200.
2. Add Apple's official black "Download on the App Store" badge, en-US and unmodified (keep its gray border), from Apple's Marketing Resources, as `assets/badges/download-on-the-app-store.svg`. The hero badge draws it as a CSS background, so nothing is requested before launch.
3. Save the App Store Marketing Tools QR code as `assets/img/app-store-qr.svg`. The "Scan with your iPhone" dialog uses it. Keep the QR code alone in its dialog: no mascot peeking over or around it.
4. Only once steps 2 and 3 are in place, change `data-launched="false"` to `data-launched="true"` on every page (`sed -i 's/data-launched="false"/data-launched="true"/' index.html */index.html 404.html`). This shows the hero badge, turns every other call to action into "Get Lockspot on the App Store", and switches the footer credit line to the version that includes the Apple logo. Flipping it first would show an empty badge and a blank QR code.
5. Add `installUrl` to the JSON-LD in `index.html`. If you add `offers`, use the live US prices from App Store Connect (Lockspot Pro: 29.99 USD a year, 6.99 USD a month), never a price of 0, and no ratings.
6. Bump `lastmod` in `sitemap.xml`.

Don't add Apple's Smart App Banner (`<meta name="apple-itunes-app">`). It makes Safari ask Apple for the app's name, icon and rating on every page view, which would be the site's first third-party request and would contradict the privacy page. The badge and the QR code cover installs. If you ever add it, update `privacy/index.html` (#website and #third-parties) in the same commit.

Before launch, `data-prelaunch-link="true"` on `<html>` turns the "Coming soon on the App Store" pill into a link. It's off by default because the App Store page returns 404 until release.

## Rules

- Everything here is original: Lockspot's own mascot, screens and words. Copy nothing from other apps' sites.
- Don't publish ratings, reviews, user counts, press logos, awards, or "first" or "only" claims.
- Don't advertise v1.1 features (Squads, the custom meme block screen) as available.
- Keep the hero tiles as generic categories, never real app icons or logos. Keep the facts row to zeros you can verify, and never add a running counter such as "time saved".
- No Snapchat look: no ghost, no yellow, no flame for streaks, no friend avatars on the map.
- Write "iPhone" exactly as spelled here, never in all caps and never as "iPhones" or "iPhone's". Keep "iOS" off marketing copy; the support page may use it.
- Keep `privacy/index.html` and the app repo's `docs/privacy-policy.md` in sync.
