# YouTube Video Downloader

A dedicated Chrome / Edge extension for YouTube videos and Shorts with audio. Version 3 starts its Windows downloader automatically through native messaging. No terminal startup or pairing key is needed for normal use.

## Upgrade from version 2

1. Run **Install YouTube Downloader.exe** once from this project folder. If you cloned the source and the EXE is missing, run **Install YouTube Downloader.cmd** to build and open the installer.
2. On your browser's Extensions page, click **Reload** for YouTube Video Downloader and accept the native-app permission if prompted.
3. Close the old downloader tab and open the extension again. It should say **Downloader ready**.

The installer keeps your existing download directory. The old manually started helper is no longer needed; let any existing downloads finish before closing its window.

## First installation (Windows 10/11 x64)

1. Install Node.js 22 or newer if needed. Setup copies the runtime into the private app folder for subsequent use.
2. Download/extract the full project package. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, click **Load unpacked**, and select this project's **extension** folder.
3. Run **Install YouTube Downloader.exe** (or **Install YouTube Downloader.cmd** when building from Git).
4. Pin the extension and open it. If it was already open during installation, click **Check connection**.

The installer runs for the current Windows user without administrator rights. It verifies downloaded yt-dlp / FFmpeg releases using published SHA256 digests, copies tools and Node to `%LOCALAPPDATA%/YouTubeVideoDownloader`, and registers the native host for Chrome and Edge. The .NET Framework compiler included with Windows builds the small native launcher.

It authorizes the unpacked extension ID derived from this project's extension-folder path. Keep the extension in that location. If you move its folder, run the installer from the new location again. Advanced installs can pass `-ExtensionId` to `helper/install.ps1`. Browser-store publishing/review is separate from this personal unpacked installation.

## Download

Open a YouTube video or Short and click the extension icon to fill its URL automatically. Alternatively, paste a link. Choose up to **720p**, up to **1080p**, or **Best available**, then click **Download video**.

The native app starts in the background on demand. yt-dlp downloads the media and FFmpeg combines video and audio. MP4 is preferred, with MKV as a fallback. Quality cannot exceed the original video. The save directory is shown in the extension; existing installations keep `Downloads/Media Extractor/YouTube`.

Up to two downloads can run per browser connection. You can close the downloader tab, but **keep Chrome/Edge running until downloads finish**. Closing the browser, disabling/reloading the extension, or restarting the native host can interrupt downloads. Recent job status resets when the native connection restarts; downloaded files remain. These files do not appear in browser download history.

Private, login/age-restricted, unavailable and DRM-protected videos, playlists, and active live streams are not supported. No browser cookies or account credentials are read. Download content you own or have permission to save.

## Update and troubleshooting

- **Connection failed:** run the installer, then Check connection. Confirm that the loaded `extension` folder belongs to the same project location.
- **YouTube extraction stopped working:** close Chrome and Edge, run **Update YouTube Downloader.cmd**, then reopen the browser.
- **Installer cannot overwrite a file:** close all Chrome/Edge windows so the old native host exits, then install again.
- **Change download folder:** edit `outputDirectory` in `%LOCALAPPDATA%/YouTubeVideoDownloader/helper/config.json` and restart the browser. The update installer imports the project helper's saved configuration.

Removing the extension prevents it from starting the native app. The app is not a Windows startup service or scheduled task. Its files live in the private app folder above; registration lives in the current user's Chrome/Edge `NativeMessagingHosts/com.personal.youtube_downloader` registry keys.

## Permissions and architecture

- `activeTab`: capture the current URL after the toolbar icon is clicked.
- `storage`: store source-tab references. Old pairing keys are no longer used.
- `nativeMessaging`: launch and communicate with the installed downloader.

The extension has no localhost host permission, general media scanner, or browser downloads permission. Native registration uses an exact extension allowlist. The native host validates its caller, framed messages and commands, and accepts only normalized single-video YouTube URLs. The tested download engine runs inside the native process behind a private, randomly authenticated loopback endpoint; this is not exposed to the extension UI. Downloader processes receive fixed arguments without a shell.

There are no analytics or cloud uploads. The native app contacts YouTube. Tool binaries, machine configuration, and generated installer EXEs are excluded from Git.

## Development and validation

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Set `CHROMIUM_EXECUTABLE` to an installed Chrome/Edge executable if needed. On a fresh checkout, run the installer first to provision dependencies used by browser tests. Tests register a uniquely named temporary native host for an isolated profile and compile a fixture downloader. They verify real native startup, installation errors, quality selection, success/failure handling, tab-close continuity, source autofill and responsive layout. Temporary registry entries and files are removed afterward. Fixture tests do not contact live YouTube. Set `NATIVE_IDLE_TEST=1` to additionally wait beyond the usual service-worker idle interval with the UI tab closed.

Build the installer with `powershell -NoProfile -ExecutionPolicy Bypass -File helper/build-installer.ps1`. Run `node scripts/live-smoke.mjs <YouTube URL>` for an optional real download through the installed app. Use short videos you may download.

References: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [YouTube runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [FFmpeg builds](https://github.com/yt-dlp/FFmpeg-Builds). Third-party tools retain their own licenses and are downloaded during setup, not committed here.
