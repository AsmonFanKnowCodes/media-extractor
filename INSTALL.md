# Install Media Extractor

Media Extractor supports **Windows 10/11 (x64)** with **Google Chrome, Microsoft Edge, or Brave**. Choose whichever browser you normally use. No separate Node.js installation, coding, or administrator access is required.

## 1. Download Windows Setup

[**Download MediaExtractor-Setup.exe**](https://github.com/AsmonFanKnowCodes/media-extractor/releases/latest/download/MediaExtractor-Setup.exe)

The installer is also available under **Releases** on the [project page](https://github.com/AsmonFanKnowCodes/media-extractor/releases/latest). It contains the extension and setup files, so you do not need to download the source-code ZIP.

The installer is not code-signed yet. Download it only from this project's release page. SHA256 checksums are provided with each release.

## 2. Run the setup wizard

1. Open **MediaExtractor-Setup.exe**.
2. Choose **Google Chrome**, **Microsoft Edge**, or **Brave** for the final browser instructions.
3. If you already use Media Extractor, finish downloads and close browsers using it first.
4. Click **Install** and wait for setup to finish. The first installation may take a few minutes, depending on your connection.

Setup obtains and verifies the required components automatically. It uses a supported existing Node.js runtime when available, or downloads a private LTS runtime from nodejs.org. It installs yt-dlp, gallery-dl and FFmpeg, and registers the background app for all three supported browsers. It does not add a Windows startup task or require a terminal to stay open.

Files are installed for your Windows account under:

```text
%LOCALAPPDATA%\MediaExtractor
```

Existing save-folder settings are kept. Downloaded videos and photos are not removed.

## 3. Add the extension to your browser

The wizard ends with **One browser step left**. Browser security requires this step until the extension is distributed through a browser store.

1. Click **Open browser extensions** in the wizard.
2. Turn on **Developer mode** on that page.
3. Click **Load unpacked**.
4. Use **Copy extension folder** in the wizard, paste that path into the folder chooser, and select the folder.
5. Pin **Media Extractor** from your browser's Extensions/puzzle-piece menu.

The correct folder is the **installed** copy:

```text
%LOCALAPPDATA%\MediaExtractor\extension
```

If you open the browser page yourself:

| Browser        | Extensions page       |
| -------------- | --------------------- |
| Google Chrome  | `chrome://extensions` |
| Microsoft Edge | `edge://extensions`   |
| Brave          | `brave://extensions`  |

The setup download or extracted source folder can be removed afterward. Keep the installed folder above—it contains the extension's working files.

## 4. Download a post

1. Open a supported post and click the pinned extension icon, or paste a post link into the popup.
2. Wait for **Ready**.
3. Click **Scan link**, then select the photos and videos you want.
4. Choose a video limit: 720p, 1080p, 1440p, 4K, or **Best available**. Photos use their supplied resolution; no upscaling is performed.
5. Change **Save location** if desired.
6. Click **Download selected** and check **Activity** for scan/download progress and saved files.

You may close the popup. Keep your browser running until downloads finish. On later uses, just click the extension—there is no manual helper startup.

## Social-post login

YouTube, Instagram, X, Reddit, TikTok, Facebook, Pinterest and Threads post links are supported. Some sites require login or block automated access.

Optional login access is **off by default**. To enable it, open Settings, turn on **Use my browser login for social posts**, and select the browser where you are signed in. This permits the local downloader to read that browser's cookies for authenticated requests. Browser protections and site restrictions may still prevent access. It does not apply to YouTube or bypass DRM/access restrictions.

## Updating or repairing

Finish downloads, close browsers using Media Extractor, and run the newest **MediaExtractor-Setup.exe**. Then click **Reload** for Media Extractor on your browser's Extensions page. Your chosen save folder is preserved.

If upgrading from an old copy loaded from Downloads/Documents, load the installed extension folder shown by the new wizard. Remove the old extension entry if both copies are listed, so you do not accidentally open the outdated one.

### Common issues

- **Setup says the app is running:** finish downloads and close browsers using it, then click **Retry**. Setup does not forcibly terminate your browser.
- **“Native messaging host not found” / “Setup needed”:** rerun the setup app, then load/reload the installed `extension` folder.
- **Script-loading error:** confirm that the loaded folder is `%LOCALAPPDATA%\MediaExtractor\extension`. Clear the old error log and Reload. If needed, remove the extension entry and load that folder again.
- **Node or tool download failed:** check your internet connection and retry. Setup verifies downloads before using them. It does not disable browser/Windows security protections.
- **Post unavailable / login required:** verify the post in your browser. Try the optional login setting only for content you may access. A public post is not a guarantee of automated downloading.

macOS, Linux, Firefox, Safari and mobile browsers are not supported by this installer yet.

## Installing from the source ZIP instead

For developers or users who prefer source:

1. On GitHub, choose **Code → Download ZIP**, then **Extract All**.
2. Double-click **Install Media Extractor.cmd** in the extracted project.
3. It builds and opens the same setup wizard. Follow the normal steps above.

Node.js and npm are not required to build this installer; the bootstrap uses the .NET Framework compiler included with Windows. The older YouTube-named CMD files remain compatibility shortcuts, but new instructions use Media Extractor names.

For version 8, rerun the updated installer and reload the extension. Accept the page-reading permission if prompted: it is used only to read the matching open post during Scan. URL/feed detection is unchanged. If scan notes mention login or missing slides, open and load the post, or explicitly enable the matching browser login if appropriate, then rescan.
