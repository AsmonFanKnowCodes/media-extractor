# Media Extractor

A personal media-tool extension for Brave / Chrome / Edge. YouTube video and Shorts downloads with audio are the current working tool. Version 3 starts its Windows downloader automatically through native messaging. No terminal startup or pairing key is needed for normal use.

## Shared visual foundation (version 5)

Click the pinned extension icon while watching YouTube. The downloader opens directly beneath the icon in a 420 × 512 popup; it no longer creates a browser tab. The shared design follows `design-system/MASTER.md`: flat white/gray surfaces, blue actions, pill controls, and bundled Inter typography. The official YouTube logo identifies the current tool.

- **Download:** video URL, quality, save-folder preview, and the download button.
- **Activity:** progress, saved filenames, errors, and actual video dimensions.
- **Settings:** choose a folder and resolve installation/connection issues.

Closing the popup or clicking outside it does not stop a download. Native work stays in the background while Brave is running. Browsing for a folder can close the popup when Windows takes focus; select the folder, then reopen the icon. The saved folder will be refreshed. URL drafts and quality are remembered for the current source page.

Existing version 3 users only need to reload the extension and close their old full-page downloader tab. No helper reinstall is needed for this UI update.

## Upgrade from version 2

1. Run **Install YouTube Downloader.exe** once from this project folder. If you cloned the source and the EXE is missing, run **Install YouTube Downloader.cmd** to build and open the installer.
2. On your browser's Extensions page, click **Reload** for YouTube Video Downloader and accept the native-app permission if prompted.
3. Close the old downloader tab and open the extension again. It should say **Downloader ready**.

The installer keeps your existing download directory. The old manually started helper is no longer needed; let any existing downloads finish before closing its window.

## First installation (Windows 10/11 x64)

1. Install Node.js 22 or newer if needed. Setup copies the runtime into the private app folder for subsequent use.
2. Download/extract the full project package. Open `brave://extensions`, `chrome://extensions` or `edge://extensions`, enable **Developer mode**, click **Load unpacked**, and select this project's **extension** folder.
3. Run **Install YouTube Downloader.exe** (or **Install YouTube Downloader.cmd** when building from Git).
4. Pin the extension and open it. If it was already open during installation, click **Check connection**.

The installer runs for the current Windows user without administrator rights. It verifies downloaded yt-dlp / FFmpeg releases using published SHA256 digests, copies tools and Node to `%LOCALAPPDATA%/YouTubeVideoDownloader`, and registers the native host for Brave, Chrome and Edge. The .NET Framework compiler included with Windows builds the small native launcher.

It authorizes the unpacked extension ID derived from this project's extension-folder path. Keep the extension in that location. If you move its folder, run the installer from the new location again. Advanced installs can pass `-ExtensionId` to `helper/install.ps1`. Browser-store publishing/review is separate from this personal unpacked installation.

## Save folder and quality

Open **Settings** and use **Browse…** for the Windows folder chooser. Selecting a folder saves it immediately. Alternatively, type an existing absolute path under **Save videos to** and click **Save folder**. The app checks that the folder is writable and remembers it for future downloads. Cancelling the dialog keeps the previous folder. You can create a new folder inside the Windows chooser.

The quality selector controls yt-dlp's real format selection. The 720/1080 options cap video height; **Best available** removes the cap and prioritizes resolution before preferring MP4. No upscaling is performed. Completed files show actual width × height inspected with FFprobe, when available.

## Download

Open a YouTube video or Short and click the extension icon to fill its URL automatically. Alternatively, paste a link. Choose up to **720p**, up to **1080p**, or **Best available**, then click **Download video**.

The native app starts in the background on demand. yt-dlp downloads the media and FFmpeg combines video and audio. MP4 is preferred, with MKV as a fallback. Quality cannot exceed the original video. The save directory is shown in the extension; existing installations keep `Downloads/Media Extractor/YouTube`.

Up to two downloads can run per browser connection. You can close the downloader tab, but **keep Brave/Chrome/Edge running until downloads finish**. Closing the browser, disabling/reloading the extension, or restarting the native host can interrupt downloads. Activity shows recent job status, which resets when the native connection restarts; downloaded files remain. These files do not appear in browser download history.

Private, login/age-restricted, unavailable and DRM-protected videos, playlists, and active live streams are not supported. No browser cookies or account credentials are read. Download content you own or have permission to save.

## Update and troubleshooting

- **Connection failed:** run the installer, then Check connection. Confirm that the loaded `extension` folder belongs to the same project location.
- **YouTube extraction stopped working:** close Brave, Chrome and Edge, run **Update YouTube Downloader.cmd**, then reopen the browser.
- **Installer cannot overwrite a file:** close all Brave/Chrome/Edge windows so the old native host exits, then install again.
- **Change download folder:** use **Browse…** to select a folder, or enter an existing absolute folder path and click **Save folder**. The choice persists across browser restarts and app updates. Running downloads keep their original destination.

Removing the extension prevents it from starting the native app. The app is not a Windows startup service or scheduled task. Its files live in the private app folder above; registration lives in the current user's Brave/Chrome/Edge `NativeMessagingHosts/com.personal.youtube_downloader` registry keys.

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

Set `CHROMIUM_EXECUTABLE` to an installed Brave/Chrome/Edge executable if needed. On a fresh checkout, run the installer first to provision dependencies used by browser tests. Tests register a uniquely named temporary native host for an isolated profile and compile a fixture downloader. They verify real native startup, installation errors, quality selection, success/failure handling, tab-close continuity, source autofill and responsive layout. Temporary registry entries and files are removed afterward. Fixture tests do not contact live YouTube. Set `NATIVE_IDLE_TEST=1` to additionally wait beyond the usual service-worker idle interval with the UI tab closed.

Build the installer with `powershell -NoProfile -ExecutionPolicy Bypass -File helper/build-installer.ps1`. Run `node scripts/live-smoke.mjs <YouTube URL>` for an optional real download through the installed app. Use short videos you may download.

References: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [YouTube runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [FFmpeg builds](https://github.com/yt-dlp/FFmpeg-Builds). Third-party tools retain their own licenses and are downloaded during setup, not committed here.
