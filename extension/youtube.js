import {
  normalizePost,
  PLATFORMS,
  PLATFORM_ASSETS,
  QUALITIES,
} from "./platforms.js";

const $ = (selector) => document.querySelector(selector);
let connected = false,
  polling = false,
  outputDirectory = "";
let folderBusy = false;
let sourceUrl = "";
let sourceTitle = "";
let activeScanId = "",
  scanData = null,
  scanBusy = false,
  scanLoading = false;
const selectedMedia = new Set();
let availableLoginBrowsers = ["brave"];
chrome.storage.local
  .get(["useBrowserSession", "loginBrowser"])
  .then((value) => {
    $("#use-browser-session").checked = value.useBrowserSession === true;
    $("#login-browser").value =
      value.loginBrowser || (value.useBrowserSession === true ? "brave" : "");
    $("#login-browser").disabled = value.useBrowserSession !== true;
  });
$("#use-browser-session").addEventListener("change", () => {
  $("#login-browser").disabled = !$("#use-browser-session").checked;
  chrome.storage.local.set({
    useBrowserSession: $("#use-browser-session").checked,
  });
});
$("#login-browser").addEventListener("change", () => {
  chrome.storage.local.set({ loginBrowser: $("#login-browser").value });
  $("#login-status").textContent = "";
});
let lastView = "download";
$("#help-button").addEventListener("click", () =>
  switchView($("#help-view").hidden ? "help" : lastView),
);
for (const button of document.querySelectorAll("[data-open-help]"))
  button.addEventListener("click", () => switchView("help"));
function updateSourceLabel() {
  const post = normalizePost($("#youtube-url").value);
  const platform = post?.platform;
  const logo = document.querySelector(".service-logo");
  logo.hidden = !platform;
  if (platform) {
    logo.src = PLATFORM_ASSETS[platform];
    logo.alt = PLATFORMS[platform];
    logo.classList.toggle("platform-icon", platform !== "youtube");
  }
  $("#source-title").textContent =
    sourceUrl === post?.url && sourceTitle
      ? sourceTitle.replace(/ - YouTube$/, "")
      : platform
        ? `${PLATFORMS[platform]} post`
        : "Scan a post";
  $("#source-caption").textContent = platform
    ? "Find photos and videos together."
    : "Paste a post link to see its media.";
}
function syncSelection() {
  const assets = scanData?.assets || [];
  $("#download-selected").disabled = !connected || !selectedMedia.size;
  $("#download-selected").textContent =
    `Download ${selectedMedia.size || ""} selected`.replace("  ", " ");
  $("#scan-select-all").checked =
    assets.length > 0 && selectedMedia.size === assets.length;
  $("#scan-select-all").indeterminate =
    selectedMedia.size > 0 && selectedMedia.size < assets.length;
  $("#youtube-quality").disabled = !assets.some(
    (asset) => selectedMedia.has(asset.id) && asset.type === "video",
  );
  $("#youtube-quality").parentElement.hidden = $("#youtube-quality").disabled;
  $("#selection-controls").hidden = !scanData || $("#download-view").hidden;
}
function saveSelection() {
  if (scanData)
    chrome.storage.session.set({
      scanSelection: { id: scanData.id, ids: [...selectedMedia] },
    });
}
function clearScan() {
  activeScanId = "";
  scanData = null;
  scanBusy = false;
  selectedMedia.clear();
  $("#scan-input-panel").hidden = false;
  $("#scan-results").hidden = true;
  $("#selection-controls").hidden = true;
  $("#youtube-download").disabled = !connected;
  $("#youtube-download").textContent = "Scan link";
  chrome.storage.session.remove(["activeScan", "scanSelection"]);
}
$("#new-scan").addEventListener("click", () => {
  clearScan();
  $("#youtube-url").focus();
});
$("#youtube-url").addEventListener("input", clearScan);
function renderScan(result) {
  scanData = result;
  scanBusy = false;
  $("#scan-input-panel").hidden = true;
  $("#scan-results").hidden = false;
  $("#scan-items").replaceChildren();
  $("#scan-summary").textContent = `${result.assets.length} items found`;
  $("#scan-warnings").hidden = !result.warnings.length;
  $("#scan-warning-text").textContent = result.warnings.join("\n\n");
  for (const asset of result.assets) {
    const row = document.createElement("label");
    row.className = "scan-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedMedia.has(asset.id);
    checkbox.setAttribute("aria-label", `Select ${asset.title}`);
    checkbox.addEventListener("change", () => {
      checkbox.checked
        ? selectedMedia.add(asset.id)
        : selectedMedia.delete(asset.id);
      syncSelection();
      saveSelection();
    });
    row.append(checkbox);
    if (asset.thumbnail) {
      const image = document.createElement("img");
      image.src = asset.thumbnail;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => image.remove();
      row.append(image);
    }
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = asset.title;
    const detail = document.createElement("small");
    detail.textContent = `${asset.type === "photo" ? "Photo" : "Video"}${asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ""} · ${asset.source}`;
    text.append(name, detail);
    row.append(text);
    $("#scan-items").append(row);
  }
  $("#youtube-status").textContent = "Select the items you want to save.";
  syncSelection();
}
$("#scan-select-all").addEventListener("change", (event) => {
  selectedMedia.clear();
  if (event.target.checked)
    for (const asset of scanData.assets) selectedMedia.add(asset.id);
  renderScan(scanData);
  saveSelection();
});
async function refreshScan(jobs) {
  const job = jobs.find((job) => job.id === activeScanId);
  if (!job || scanLoading) return;
  if (job.state === "scanning") {
    scanBusy = true;
    $("#youtube-download").disabled = true;
    $("#youtube-download").textContent = "Scanning…";
    $("#youtube-status").textContent = job.progress;
    return;
  }
  if (job.state === "failed") {
    scanBusy = false;
    $("#youtube-download").disabled = !connected;
    $("#youtube-download").textContent = "Scan again";
    $("#youtube-status").textContent = `Scan failed: ${job.error}`;
    return;
  }
  if (job.state === "ready" && scanData?.id !== job.id) {
    scanLoading = true;
    try {
      const { scan } = await request({
        type: "youtube-scan-result",
        scanId: job.id,
      });
      if (activeScanId !== scan.id) return;
      selectedMedia.clear();
      const { scanSelection } =
        await chrome.storage.session.get("scanSelection");
      for (const asset of scan.assets)
        if (
          scanSelection?.id !== scan.id ||
          scanSelection.ids.includes(asset.id)
        )
          selectedMedia.add(asset.id);
      renderScan(scan);
    } catch (error) {
      $("#youtube-status").textContent = error.message;
      scanBusy = false;
      $("#youtube-download").disabled = !connected;
    } finally {
      scanLoading = false;
    }
  }
}
$("#youtube-url").addEventListener("input", updateSourceLabel);
$("#setup-shortcut").addEventListener("click", () => switchView("settings"));
function switchView(view) {
  if (view !== "help") lastView = view;
  $("#help-button").setAttribute("aria-pressed", String(view === "help"));
  for (const button of document.querySelectorAll("[data-view]"))
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  for (const section of document.querySelectorAll(".view"))
    section.hidden = section.id !== `${view}-view`;
  document.querySelector("main").scrollTop = 0;
  syncSelection();
}
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => switchView(button.dataset.view));
$("#folder-shortcut").addEventListener("click", () => switchView("settings"));
function connectionState(ready, error = "") {
  $("#connection-label").textContent = ready ? "Ready" : "Setup needed";
  $("#connection-label").dataset.state = ready ? "ready" : "error";
  $("#connection-detail").textContent = error;
  document.body.dataset.connection = ready ? "ready" : "error";
  $("#setup-banner").hidden = ready;
  $("#youtube-download").disabled = !ready || scanBusy;
  if (!ready) $("#folder-preview").textContent = "Available after setup";
}
function saveDraft() {
  chrome.storage.local.set({
    popupDraft: {
      url: $("#youtube-url").value,
      quality: $("#youtube-quality").value,
      sourceUrl,
    },
  });
}
$("#youtube-url").addEventListener("input", saveDraft);
$("#youtube-quality").addEventListener("change", saveDraft);
function showFolder(folder) {
  outputDirectory = folder;
  $("#folder-preview").textContent = folder;
  $("#folder-shortcut").title = folder;
  $("#save-folder").value = folder;
  $("#save-folder").disabled = false;
  $("#browse-folder").disabled = false;
  $("#save-folder-button").disabled = false;
}
async function changeFolder(browse) {
  if (folderBusy) return;
  folderBusy = true;
  $("#browse-folder").disabled = true;
  $("#save-folder-button").disabled = true;
  $("#folder-status").textContent = browse
    ? "Choose a folder in the Windows dialog…"
    : "Saving folder…";
  try {
    const result = await request(
      browse
        ? { type: "youtube-choose-folder" }
        : {
            type: "youtube-set-folder",
            outputDirectory: $("#save-folder").value.trim(),
          },
    );
    showFolder(result.outputDirectory);
    $("#folder-status").textContent = result.cancelled
      ? "Folder unchanged."
      : "Saved for future downloads.";
  } catch (error) {
    $("#folder-status").textContent = `Folder not changed: ${error.message}`;
  } finally {
    folderBusy = false;
    $("#browse-folder").disabled = false;
    $("#save-folder-button").disabled = false;
  }
}
$("#browse-folder").addEventListener("click", () => changeFolder(true));
$("#folder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  changeFolder(false);
});
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok)
    throw new Error(response?.error || "Could not connect to the extension.");
  return response;
}
function showJobs(jobs) {
  const fragment = document.createDocumentFragment();
  for (const job of jobs.slice(0, 10)) {
    const row = document.createElement("article");
    row.className = "youtube-job";
    const title = document.createElement("a");
    title.href = job.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = job.filename
      ? job.filename.split(/[\\/]/).pop()
      : job.url;
    const status = document.createElement("p");
    status.textContent =
      job.state === "failed"
        ? `Failed: ${job.error}`
        : job.state === "complete"
          ? `Saved: ${job.filename}`
          : job.progress;
    if (job.width && job.height)
      status.textContent = `${job.width} × ${job.height} pixels · ${status.textContent}`;
    if (job.files?.length > 1) {
      title.textContent = `${PLATFORMS[job.platform] || "Post"} · ${job.files.length} files`;
      if (job.state === "complete")
        status.textContent = `Saved ${job.files.length} files to ${job.directory || job.outputDirectory}`;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Show files";
      const list = document.createElement("ul");
      list.className = "files-list";
      for (const file of job.files.slice(0, 50)) {
        const entry = document.createElement("li");
        entry.textContent = file.split(/[\\/]/).pop();
        list.append(entry);
      }
      details.append(summary, list);
      row.append(details);
    }
    if (job.state === "partial") status.textContent = job.error;
    if (job.kind === "scan") {
      title.textContent = `Scan · ${PLATFORMS[job.platform] || "Post"}`;
      if (job.state === "ready") {
        const show = document.createElement("button");
        show.textContent = "View results";
        show.addEventListener("click", () => {
          activeScanId = job.id;
          scanData = null;
          $("#youtube-url").value = job.url;
          updateSourceLabel();
          chrome.storage.session.set({
            activeScan: { id: job.id, url: job.url },
          });
          switchView("download");
          refreshScan(jobs);
        });
        row.append(show);
      }
    }
    row.dataset.state = job.state;
    row.prepend(title, status);
    fragment.append(row);
  }
  $("#youtube-jobs").replaceChildren(fragment);
  $("#jobs-empty").hidden = jobs.length > 0;
  $("#job-count").textContent = jobs.length;
  refreshScan(jobs);
}
async function refreshJobs() {
  if (!connected || polling) return;
  polling = true;
  try {
    const result = await request({ type: "youtube-jobs" });
    showJobs(result.jobs);
  } catch (error) {
    connected = false;
    $("#youtube-status").textContent = connected
      ? error.message
      : "Downloader unavailable. Open Settings to finish setup.";
    if (!connected) connectionState(false, error.message);
    $("#youtube-setup").hidden = false;
    $("#youtube-setup").open = true;
  } finally {
    polling = false;
  }
}
async function connect() {
  const info = await request({ type: "youtube-info" });
  if (!info.scanFirst)
    throw new Error(
      "Install the latest helper to enable scanning and selected downloads.",
    );
  connected = true;
  availableLoginBrowsers = info.loginBrowsers || ["brave"];
  connectionState(true);
  showFolder(info.outputDirectory);
  $("#youtube-status").textContent = "Ready to download.";
  $("#youtube-setup").open = false;
  $("#youtube-setup").hidden = true;
  await refreshJobs();
}
$("#youtube-retry").addEventListener("click", async () => {
  $("#youtube-retry").disabled = true;
  $("#youtube-status").textContent = "Starting the downloader…";
  try {
    await connect();
  } catch (error) {
    $("#youtube-status").textContent = connected
      ? error.message
      : "Downloader unavailable. Open Settings to finish setup.";
    if (!connected) connectionState(false, error.message);
    $("#youtube-setup").hidden = false;
    $("#youtube-setup").open = true;
  } finally {
    $("#youtube-retry").disabled = false;
  }
});
function sessionOptions(url) {
  const useSession =
    $("#use-browser-session").checked &&
    normalizePost(url)?.platform !== "youtube";
  const browser = $("#login-browser").value;
  if (useSession && !availableLoginBrowsers.includes(browser)) {
    switchView("settings");
    $("#login-status").textContent =
      "Choose a supported login browser, or update the helper.";
    return null;
  }
  return { useBrowserSession: useSession, loginBrowser: browser };
}
$("#youtube-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const post = normalizePost($("#youtube-url").value.trim());
  if (!post) {
    $("#youtube-status").textContent =
      "Enter an individual post link from a supported platform.";
    return;
  }
  try {
    if (!connected) await connect();
    const auth = sessionOptions(post.url);
    if (!auth) return;
    scanBusy = true;
    scanData = null;
    $("#youtube-download").disabled = true;
    $("#youtube-download").textContent = "Scanning…";
    $("#youtube-status").textContent =
      "Inspecting photos and videos. You can close this popup while it scans.";
    const response = await request({
      type: "youtube-scan",
      url: post.url,
      ...auth,
    });
    if (normalizePost($("#youtube-url").value)?.url !== post.url) return;
    activeScanId = response.job.id;
    await chrome.storage.session.set({
      activeScan: { id: activeScanId, url: post.url },
    });
    await refreshJobs();
  } catch (error) {
    scanBusy = false;
    $("#youtube-download").disabled = !connected;
    $("#youtube-download").textContent = "Scan again";
    $("#youtube-status").textContent = error.message;
  }
});
$("#download-selected").addEventListener("click", async () => {
  if (!scanData || !selectedMedia.size) return;
  const auth = sessionOptions(scanData.url);
  if (!auth) return;
  $("#download-selected").disabled = true;
  try {
    await request({
      type: "youtube-download-selected",
      scanId: scanData.id,
      assetIds: [...selectedMedia],
      quality: $("#youtube-quality").value,
      ...auth,
    });
    $("#youtube-status").textContent =
      "Download started. See Activity for progress.";
    await refreshJobs();
    switchView("activity");
  } catch (error) {
    $("#youtube-status").textContent = error.message;
  } finally {
    syncSelection();
  }
});
async function useSource() {
  const sourceHash = location.hash;
  const tabId = sourceHash ? Number(sourceHash.slice(1)) : undefined;
  try {
    const [source, preferences, sessionState] = await Promise.all([
      request({ type: "youtube-source", tabId }),
      chrome.storage.local.get("popupDraft"),
      chrome.storage.session.get("activeScan"),
    ]);
    if (location.hash !== sourceHash) return;
    sourceUrl = source.url || "";
    sourceTitle = source.title || "";
    const draft = preferences.popupDraft;
    $("#youtube-url").value =
      draft?.sourceUrl === sourceUrl
        ? draft.url
        : sourceUrl || (!sourceHash ? draft?.url || "" : "");
    if (QUALITIES.includes(draft?.quality))
      $("#youtube-quality").value = draft.quality;
    if (
      sessionState.activeScan?.url ===
      normalizePost($("#youtube-url").value)?.url
    )
      activeScanId = sessionState.activeScan.id;
    updateSourceLabel();
  } catch {
    /* Manual URL entry remains available. */
  }
}
useSource();
window.addEventListener("hashchange", useSource);
connect().catch((error) => {
  $("#youtube-status").textContent =
    "Downloader unavailable. Open Settings to finish setup.";
  connectionState(false, error.message);
  $("#youtube-setup").hidden = false;
  $("#youtube-setup").open = true;
});
setInterval(() => {
  if (!document.hidden) refreshJobs();
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshJobs();
});
