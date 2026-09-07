# Install Media Extractor from zero

For **Windows 10/11 (64-bit)** and **Brave**. Chrome and Edge are also supported. You do not need Git, npm commands, or a terminal running while downloading.

## 1. Remove the old extension if you are starting over

Skip this step on a computer that has never had Media Extractor.

1. In Brave's address bar, enter `brave://extensions`.
2. Find **Media Extractor**, or an older **YouTube Video Downloader** entry.
3. Click **Remove** on the old installation. If you have multiple copies of this project installed, remove those old copies too.
4. Close Brave. Close Chrome/Edge too if you used this extension there.

Removing the extension clears its popup preferences, but **does not delete your downloaded videos/photos**. The Windows app's existing save-folder setting is retained by the installer.

## 2. Install Node.js once

1. Visit [the official Node.js download page](https://nodejs.org/en/download).
2. Choose an **LTS release, version 22 or newer**, and its **Windows Installer (.msi)** for x64.
3. Run the installer using its normal defaults, including adding Node.js to PATH.
4. If Node.js 22 or newer is already installed, skip this step.

Node is needed for the installer and downloader. You do not have to open it or write code.

## 3. Download the project from GitHub

1. Open [AsmonFanKnowCodes/media-extractor](https://github.com/AsmonFanKnowCodes/media-extractor).
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Find the downloaded `media-extractor-main.zip` in your Downloads folder.
5. Right-click the ZIP and choose **Extract All**.
6. Extract it somewhere permanent, such as `Documents\MediaExtractor`.

Open the extracted folder until you see these items together:

```text
extension\
helper\
Install YouTube Downloader.cmd
Update YouTube Downloader.cmd
README.md
```

**Do not run the installer from inside the ZIP.** Keep the extracted project folder in this location: the unpacked extension loads its files directly from there.

## 4. Install the background app once

With Brave closed:

1. Double-click **Install YouTube Downloader.cmd** in the extracted project folder.
2. A command window may appear briefly while the installer is built. Then the setup window opens.
3. Wait for **Setup complete**. The first installation downloads the required tools, so it can take a few minutes.
4. Click **OK** when setup finishes.

The filename is left over from the original YouTube-only version; **it installs the helper for all supported platforms**. GitHub's source ZIP does not include a prebuilt EXE—the CMD file builds it for you.

Setup installs yt-dlp, gallery-dl, FFmpeg and a private Node runtime into your Windows user account, and registers the background app for Brave/Chrome/Edge. There is no pairing key to copy.

## 5. Load the extension in Brave

1. Open Brave and enter `brave://extensions` in the address bar.
2. Turn on **Developer mode**, usually at the top right.
3. Click **Load unpacked**.
4. Select the **extension** subfolder inside the same extracted project from step 3. This is the folder containing `manifest.json`.
5. Confirm that **Media Extractor** appears in the list.
6. Open the puzzle-piece **Extensions** menu on the browser toolbar and pin **Media Extractor**.

For Chrome, use `chrome://extensions`; for Edge, use `edge://extensions`.

## 6. Start your first download

1. Open a supported post/video, then click the pinned Media Extractor icon. You can also paste its link into the popup yourself.
2. Wait for the **Ready** badge.
3. Choose **Video** or **Photos**. YouTube supports Video only.
4. For video, choose **720p**, **1080p**, **1440p**, **4K**, or **Best available**. These are maximums, not upscaling.
5. To change the save folder, click **Save location**, then **Browse…** in Settings. Select a folder. If the popup closes when the Windows chooser opens, reopen the extension afterward.
6. Click **Download video** or **Download photos**.
7. Open **Activity** to see progress, failures, and saved files.

You can close the popup. **Keep Brave running until downloads finish.** The background app starts automatically; you never need to start the old helper window manually.

## Social posts and login

Supported platforms: YouTube, Instagram, X, Reddit, TikTok and Facebook. Use individual post links, not profile/feed URLs. For a mixed post, run Video and Photos separately.

Some sites require login or block automated access. **Settings → Use my Brave login for social posts** is optional and off by default. Enabling it allows the local downloader to read Brave cookies to make authenticated requests. Only enable it for content you may access. Browser protection, account restrictions and website changes can still prevent a download.

## If something goes wrong

### “An unknown error occurred when fetching the script”

This is a browser-side script loading error, not a YouTube download error. Confirm you extracted the **whole repository**, loaded its **extension** folder, and have not moved or deleted the files.

On `brave://extensions`, open the extension's **Errors** page and click **Clear all**. Return to the extension card, click **Reload**, wait a few seconds, then reopen its popup. If the same error returns, use **Remove** and load the `extension` folder again. Record the fresh error if it still occurs; do not assume an old error entry describes the current version.

### “Native messaging host not found” / “Setup needed”

Close Brave and rerun **Install YouTube Downloader.cmd from the same project folder you loaded**. Reopen Brave and the extension. If the folder was moved, rerun the installer from its new location.

### “Node is not recognized” or Node.js missing

Install Node.js 22 or newer from step 2, then reopen the installer. If Windows still does not find it, sign out and back in, or restart Windows to refresh PATH.

### Installer says a file is in use

Finish your downloads and close all browsers using this extension, then retry. Do not update while a download is running.

### Website says login required / unavailable / blocked

Verify that the post exists and that you can open it normally. If appropriate, enable the optional Brave-login setting. Private content you cannot access, DRM, active live streams, and site blocks are not bypassed. Public availability alone does not guarantee automated downloading.

## Updating later

- To update the downloader tools: finish downloads, close Brave, run **Update YouTube Downloader.cmd**, then reopen Brave.
- To update the extension's code: download and extract the latest GitHub ZIP. If using a new folder, rerun its installer and load its `extension` folder. If updating the existing folder, replace the extension files together while the extension is not running, then click **Reload**.

Saved downloads remain on disk. Keep the permanent project folder and do not leave multiple old copies of the extension enabled.
