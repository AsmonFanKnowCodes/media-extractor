# Media Extractor

A personal Chrome / Edge extension for finding and downloading images and videos from the page you are visiting. No account, backend, analytics, or paid service. This is a standalone project.

## Install

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions`. In Edge, open `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project's **extension** folder (the folder containing `manifest.json`).
5. Pin **Media Extractor** in your browser toolbar.

## Use

1. Visit a website and click the extension icon.
2. A gallery opens in a new tab, showing media from the original page.
3. Filter by images or videos, search by filename / URL, and select files.
4. Click **Download selected**, or use a card's **Download** button.

Files go to `Downloads/Media Extractor`. Duplicate names are automatically renamed. Your browser's download preferences or security checks may still display prompts. Per-file status shows download completion or interruption while the gallery stays open; **View downloads** opens the browser's full download history. Keep the gallery open until the batch has started; already-started downloads continue if it closes.

Scroll the source website to load more images, or start a video, then use **Rescan page**. Selection applies across filters; **Select visible files** affects the currently displayed results.

## What it finds

- Images, current responsive images, `srcset` variants, and common lazy-loading attributes.
- CSS background images and open shadow DOM content.
- Video elements, video sources, posters, and direct media links.
- Open Graph / Twitter image metadata and Open Graph video metadata.
- Recognizable media URLs in the page's resource timing entries.
- Accessible same-origin embedded frames.

URLs are deduplicated without stripping signed query parameters. Video previews load only when played. Images are loaded from their original hosts for previews.

## Limits

This does not promise every file from every website. It scans currently exposed media; it does not crawl a whole site, intercept all network traffic, or automatically scroll pages. Cross-origin embedded frames must be opened and scanned separately. Closed shadow roots, canvas pixels, inline SVG markup, and media hidden inside application-specific data are not extracted.

HLS/DASH manifests and temporary `blob:` media are identified when exposed but have no direct-file download. It does not assemble streaming segments or bypass DRM. Some servers deny downloads or previews because they require specific cookies, headers, or expiring authorization. Browser settings pages, extension stores, and other restricted pages cannot be scanned.

## Privacy and permissions

Scanning happens only after you click the toolbar icon. There is no persistent access to every website.

- `activeTab`: temporary access to the website you invoke it on.
- `scripting`: inspect that page's media.
- `downloads`: save selected files and show progress.
- `storage`: keep the source tab reference in browser session memory.

There are no external scripts, telemetry, or cloud uploads. Previews and downloads contact the original media servers. Browser download history and downloaded files persist normally. Use media according to its owner's permissions.

## Development

The extension uses native JavaScript modules and Manifest V3. No build step or runtime dependencies.

```sh
npm test
npm run check
```

Browser integration checks (requires Node and a downloaded test browser):

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The browser test runs a temporary extension copy with localhost-only host access to automate scanning. The shipped extension retains only `activeTab` access. Tests cover extraction, filters, selection, real browser downloads, failures, rescanning, and responsive layout. Screenshots are written to `test-results/`. Set `CHROMIUM_EXECUTABLE` to use an existing compatible Chromium executable.

Load `extension/` unpacked, and click **Reload** in the extensions page after editing. The scanner is a self-contained function serialized through Chrome's scripting API.

API references: [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Chrome downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).
