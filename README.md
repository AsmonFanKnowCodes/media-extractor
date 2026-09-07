# Media Extractor

A compact browser extension for downloading videos and photo posts from **YouTube, Instagram, X, Reddit, TikTok, Facebook, Pinterest and Threads**. Files are saved locally using an automatically started background app.

[**Download Windows Setup**](https://github.com/AsmonFanKnowCodes/media-extractor/releases/latest/download/MediaExtractor-Setup.exe) · [Installation guide](INSTALL.md) · [Releases](https://github.com/AsmonFanKnowCodes/media-extractor/releases)

## Install

For **Windows 10/11 x64** and **Chrome, Edge or Brave**:

1. Download and run **MediaExtractor-Setup.exe**.
2. Choose your browser and click **Install**. Required components are obtained automatically.
3. Use the wizard's **Open browser extensions** and **Copy extension folder** buttons to add Media Extractor with **Developer mode → Load unpacked**.
4. Pin the extension and start downloading.

No separate Node.js setup, Git, npm commands, administrator account, or persistent terminal is needed. The installer includes its setup payload and installs into `%LOCALAPPDATA%\MediaExtractor`; the original download folder is not needed afterward. The installer is currently unsigned. See [INSTALL.md](INSTALL.md) for first-time setup, upgrades and troubleshooting.

## Features

- Automatic recognition of individual post links on the eight supported platforms.
- **Scan link → select media → download**. Mixed posts show photos and videos together.
- Video limits of **720p, 1080p, 1440p and 4K**, plus uncapped **Best available**. No upscaling.
- Remembered save location and local file-dimension reporting.
- Activity tracks completed, failed, partial and multi-file downloads.
- In-popup **Help** with installation and troubleshooting instructions.
- Optional login through the user's chosen Chrome, Edge or Brave session, off by default.

The popup can close while downloads continue; keep the browser running. Use individual post/video links rather than profiles or feeds. Scan the link, review the detected media, and select any combination of photos and videos.

## Site access and privacy

Site support depends on what the platform makes accessible. Some posts require login, and sites can block automated requests or change their extraction behavior. DRM and access restrictions are not bypassed. Only save media you own or have permission to download.

Cookie access requires explicitly enabling **Use my browser login for social posts** and selecting a browser. No browser credentials are read by default. When enabled, the local tools use that browser's cookies for website requests; no cookie export is uploaded to a separate service. Browser encryption, locked/non-default profiles and site restrictions may still prevent it. This option does not apply to YouTube.

No analytics or hosted download service is included. Third-party tools are downloaded from their official distribution sources and verified using published SHA256 digests.

## Architecture

The extension uses Manifest V3, native JavaScript modules, and `activeTab`, `storage`, `scripting`, and `nativeMessaging` permissions. It does not scan whole websites or require localhost host access. The native host uses an exact extension allowlist, bounded framed messages and validated individual-post URLs. Downloader arguments are passed without a shell.

yt-dlp handles videos, gallery-dl handles photos, and FFmpeg/FFprobe combine tracks and inspect files. The engine's private loopback endpoint stays inside the native process and is not exposed to the extension UI. The installed runtime and settings remain under the current Windows user's app directory. The native-host identifier retains its historical name for compatibility.

Design rules are in [design-system/MASTER.md](design-system/MASTER.md). Official platform-asset provenance and the bundled Inter license are in [extension/assets](extension/assets).

## Development

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Set `CHROMIUM_EXECUTABLE` to an installed compatible browser executable if necessary. Browser tests use isolated profiles, temporary native registrations and fixture downloaders. They exercise the actual popup dimensions, installation errors, platform routing, multi-file results, folder settings, optional browser selection and background continuity. They do not read real cookies. Unit tests also exercise real yt-dlp format selection when its executable is provisioned.

Build the self-contained Windows setup app:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File helper/build-installer.ps1
```

Output: `MediaExtractor-Setup.exe`. Its embedded payload includes only extension files and top-level helper source files; local configs, keys, tool binaries and test outputs are excluded. `Install Media Extractor.cmd` builds and opens the same wizard. `Update Media Extractor.cmd` provides a source-tree update path.

`helper/install.ps1` supports isolated test destinations and host names. `-IgnoreSystemNode` exercises private runtime provisioning; `-RefreshTools` fetches current media-tool releases. Optional `node scripts/live-smoke.mjs <YouTube URL>` checks an actual permitted download.

All social routes are fixture-tested. A live Instagram check required login and Reddit blocked the test request; unauthenticated success on every platform is not claimed. A real YouTube download with audio/video has been verified.

References: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Node.js](https://nodejs.org/), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [gallery-dl](https://github.com/mikf/gallery-dl), [FFmpeg builds](https://github.com/yt-dlp/FFmpeg-Builds). Third-party tools retain their own licenses.

## Scan-first behavior (version 8)

Scans are recorded in Activity immediately, including extraction failures. The helper inspects video metadata and gallery metadata before downloading. Selected images are fetched from validated platform media hosts and saved byte-for-byte after signature validation; HTML/login pages cannot become fake image files. Selections are tied to an in-memory scan ID and expire after 20 minutes or a helper restart.

When the input matches the currently open post, a scoped page read can recover media from its embedded post data or rendered post container. This leaves URL detection unchanged and does not scroll feeds or automatically click through slides. It does not read browser cookies; the separate optional login setting remains explicit. Scan notes identify remote failures and incomplete fallback results.

Instagram progressive H.264 sources are probed for actual dimensions/bitrate rather than discarded for missing metadata. Compatible H.264 is preferred when available to avoid problematic VP9/DASH playback; this may have fewer pixels than another rendition. Quality caps use the short edge for portrait videos. Video/audio tracks are not automatically sharpened, upscaled, transcoded, or volume-normalized. One reported Reel was measured at -14.1 LUFS for both its prior and progressive sources.

Pinterest individual pins and pin.it links are supported; boards are excluded. Threads uses public page data or the matching open post. Some private, blocked, or unloaded media still cannot be extracted. No universal access guarantee is made.

Validation includes real Instagram scan-to-H.264-MP4 download, a real Pinterest image download, structured Instagram/TikTok/Threads parsing, exact image-byte transfer, portrait quality selection, and actual Brave popup/native mixed-selection tests with remote failures. No real browser cookies were read during tests.
