# Media Extractor

A personal Chrome / Edge extension for finding and downloading images and videos from the page you are visiting. No account, hosted backend, analytics, or paid service. This is a standalone project.

Version 1.1 adds **YouTube video and Shorts downloads with audio**, using a Windows helper that runs on your own computer.

## YouTube setup (Windows)

1. Install Node.js 22 or newer if it is not already installed.
2. In this project folder, double-click **Setup YouTube Helper.cmd**. This downloads yt-dlp from its official GitHub release and checks its SHA256 digest. It uses your existing FFmpeg, or downloads and verifies the yt-dlp project's FFmpeg build if needed.
3. Double-click **Start YouTube Helper.cmd**. Keep that window open while downloading.
4. Install the extension as described below, or click **Reload** on its card in your browser's Extensions page if you already installed it. Accept the new localhost permission if prompted.
5. Open the extension's **YouTube videos** section. Under **Connect local helper**, paste the pairing key from the helper window and click **Connect helper**. This is needed only once per extension installation.
6. Open a YouTube video or Short and click the extension icon. Its URL fills in automatically. You can also paste a YouTube link directly.
7. Choose **Up to 720p**, **Up to 1080p**, or **Best available**, then click **Download video**.

YouTube files save to your Windows Downloads folder under `Media Extractor/YouTube`. The helper combines video and audio with FFmpeg. MP4 is preferred; MKV is used when the available formats require it. Quality is capped by the source; a 240p video does not become 1080p. The YouTube section shows progress and the saved filename. These downloads are saved by the helper, so they do not appear in the browser's download history.

The helper supports up to two simultaneous downloads. Closing the extension tab does not stop them. Its recent job list is held in memory and resets when the helper restarts; saved files remain on disk. To stop the helper, press Ctrl+C in its window. Stop it before updating.

YouTube changes regularly. If extraction stops working, close the helper, run **Setup YouTube Helper.cmd** again to update yt-dlp, then restart it. Unavailable, private, age/login-restricted and DRM-protected videos are not supported; active live streams are excluded. The helper does not read browser cookies or account credentials, and does not bypass access restrictions. Only download media you own or have permission to save.

The helper is Windows-only in this release. The ordinary image/direct-video extension remains independent of it. Download the full project to get the helper scripts; the extension-only ZIP does not include them.

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

In the general media gallery, HLS/DASH manifests and temporary `blob:` media are identified when exposed but have no direct-file download. Use the separate **YouTube videos** section for supported YouTube pages. Other streaming sites are not assembled or downloaded through the helper. Some servers deny downloads or previews because they require specific cookies, headers, or expiring authorization. Browser settings pages, extension stores, and other restricted pages cannot be scanned.

## Privacy and permissions

Scanning happens only after you click the toolbar icon. There is no persistent access to every website.

- `activeTab`: temporary access to the website you invoke it on.
- `scripting`: inspect that page's media.
- `downloads`: save selected files and show progress.
- `storage`: keep the source tab reference in browser session memory.
- Localhost access (`http://127.0.0.1/*`): communicate with the YouTube helper at port 43127. The helper binds only to `127.0.0.1`, requires a random pairing key, validates the requesting origin and host, and accepts only normalized single-video YouTube links. It launches yt-dlp with fixed arguments without a shell.

There are no external extension scripts, telemetry, or cloud uploads. Previews and downloads contact the original media servers; the helper contacts YouTube through yt-dlp and uses the installed Node runtime for yt-dlp's bundled YouTube extractor scripts. The pairing key is saved in extension local storage and in `helper/.local/pairing-key.txt`. Local helper configuration and downloaded tools are excluded from Git. Browser download history and downloaded files persist normally.

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

The browser test runs a temporary extension copy and a local fixture site/helper. Tests cover extraction, filters, selection, real browser direct downloads, failures, rescanning, responsive layout, YouTube pairing and its download UI. Automated YouTube tests use a fixture downloader to avoid depending on live YouTube availability. Live downloads must be checked separately. Screenshots are written to `test-results/`. Set `CHROMIUM_EXECUTABLE` to use an existing compatible Chromium executable.

Load `extension/` unpacked, and click **Reload** in the extensions page after editing. The scanner is a self-contained function serialized through Chrome's scripting API.

API references: [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Chrome downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads).

Helper dependencies: [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp), [YouTube JavaScript runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [FFmpeg builds](https://github.com/yt-dlp/FFmpeg-Builds). These third-party tools retain their own licenses; their binaries are downloaded during setup and are not included in the repository.
