# YouTube Video Downloader

A dedicated Chrome / Edge extension for downloading YouTube videos and Shorts with audio. Choose up to 720p, up to 1080p, or best available quality. The Windows helper uses yt-dlp and FFmpeg on your computer.

## Existing installation

Click **Reload** on the extension's card in your browser's Extensions page, then close the old downloader tab and open the extension again. It now appears as **YouTube Video Downloader**. Your saved helper pairing and existing download directory continue to work.

## First-time setup (Windows)

1. Install Node.js 22 or newer if needed.
2. Download or clone this project. Double-click **Setup YouTube Helper.cmd**. It downloads yt-dlp from its official GitHub release and verifies the SHA256 digest. It uses an existing FFmpeg or downloads a verified build from the yt-dlp FFmpeg project.
3. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, click **Load unpacked**, and select this project's **extension** folder.
4. Pin **YouTube Video Downloader** in the browser toolbar.
5. Double-click **Start YouTube Helper.cmd** and keep its window open.
6. Open the extension and paste the helper's pairing key into **Connect local helper**, then click **Connect helper**. Pairing is saved for later sessions.

## Download

Open a YouTube video or Short and click the extension icon to fill its link automatically. Alternatively, paste a link into the downloader. Choose quality and click **Download video**.

**Your downloads** shows recent progress, failures, and saved file locations. The helper combines video and audio. MP4 is preferred, with MKV as a fallback when required by available formats. Quality cannot exceed the source video. Downloads save to the directory shown by the helper, initially your Windows Downloads folder under `Media Extractor/YouTube`.

Up to two downloads can run simultaneously. Closing the extension tab does not stop them; keep the helper running. Its recent job list resets when the helper restarts, while saved files remain. Press Ctrl+C in the helper window to stop it. Downloads are written by the helper, not listed in the browser's download history.

Only single-video links are supported. Private, age/login-restricted, unavailable and DRM-protected videos, playlists, and active live streams are not supported. The helper does not read browser cookies or account credentials. Download content you own or have permission to save.

If YouTube extraction stops working, stop the helper, rerun **Setup YouTube Helper.cmd** to update yt-dlp, and restart it.

## Permissions and privacy

- `activeTab`: read the current tab's URL after you click the extension icon. It does not scan or inject scripts into the page.
- `storage`: remember the source URL and save the helper pairing key.
- `http://127.0.0.1/*`: contact the helper on port 43127. It binds to loopback only and requires the pairing key. It validates the host, requesting origin, and YouTube URL, and launches fixed downloader arguments without a shell.

There are no analytics, cloud uploads, or hosted services. The helper contacts YouTube using yt-dlp. Local settings, pairing keys, and downloaded tools are excluded from Git. No general media scanning, image downloads, gallery, or browser downloads permission is included.

## Development

Native JavaScript modules and Manifest V3; no extension build step.

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Set `CHROMIUM_EXECUTABLE` to a compatible installed Chrome or Edge executable if needed. Browser tests use an isolated extension profile and a fixture downloader to check source autofill, pairing, quality submission, success/failure status, saved pairing, and responsive layout without relying on live YouTube availability. Screenshots go to `test-results/`.

Helper dependencies: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [YouTube runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [FFmpeg builds](https://github.com/yt-dlp/FFmpeg-Builds). Their licenses apply to the third-party tools, which are downloaded during setup and not committed here.
