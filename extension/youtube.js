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
let lastVideoQuality = "1080";
chrome.storage.local.get("useBrowserSession").then((value) => {
  $("#use-browser-session").checked = value.useBrowserSession === true;
});
$("#use-browser-session").addEventListener("change", () =>
  chrome.storage.local.set({
    useBrowserSession: $("#use-browser-session").checked,
  }),
);
function updateSourceLabel() {
  const post = normalizePost($("#youtube-url").value);
  const matches = sourceUrl && post?.url === sourceUrl;
  const platform = post?.platform;
  const logo = document.querySelector(".service-logo");
  logo.hidden = !platform;
  if (platform) {
    logo.src = PLATFORM_ASSETS[platform];
    logo.alt = PLATFORMS[platform];
    logo.classList.toggle("platform-icon", platform !== "youtube");
  }
  $("#source-title").textContent =
    matches && sourceTitle
      ? sourceTitle.replace(/ - YouTube$/, "")
      : platform
        ? `${PLATFORMS[platform]} post`
        : "Paste a post link";
  $("#source-caption").textContent = platform
    ? "Choose Video or Photos below."
    : "YouTube, Instagram, X, Reddit, TikTok, Facebook";
  const photosOption = $('#media-kind option[value="photos"]');
  photosOption.disabled = platform === "youtube";
  if (platform === "youtube") {
    if ($("#media-kind").value === "photos")
      $("#youtube-quality").value = lastVideoQuality;
    $("#media-kind").value = "video";
  }
  updateMediaKind();
}
function updateMediaKind() {
  const photos = $("#media-kind").value === "photos";
  $("#youtube-quality").disabled = photos;
  const bestOption = $('#youtube-quality option[value="best"]');
  if (photos) {
    if ($("#youtube-quality").value !== "best")
      lastVideoQuality = $("#youtube-quality").value;
    bestOption.textContent = "Original photos";
    $("#youtube-quality").value = "best";
  } else {
    bestOption.textContent = "Best available";
  }
  $("#youtube-download").textContent = photos
    ? "Download photos"
    : "Download video";
}
$("#media-kind").addEventListener("change", () => {
  if ($("#media-kind").value === "video")
    $("#youtube-quality").value = lastVideoQuality;
  updateMediaKind();
  saveDraft();
});
$("#youtube-url").addEventListener("input", updateSourceLabel);
$("#setup-shortcut").addEventListener("click", () => switchView("settings"));
function switchView(view) {
  for (const button of document.querySelectorAll("[data-view]"))
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  for (const section of document.querySelectorAll(".view"))
    section.hidden = section.id !== `${view}-view`;
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
  $("#youtube-download").disabled = !ready;
  if (!ready) $("#folder-preview").textContent = "Available after setup";
}
function saveDraft() {
  chrome.storage.local.set({
    popupDraft: {
      url: $("#youtube-url").value,
      quality: $("#youtube-quality").value,
      mediaType: $("#media-kind").value,
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
      title.textContent = `${PLATFORMS[job.platform] || "Post"} · ${job.files.length} ${job.mediaType === "photos" ? "photos" : "videos"}`;
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
    row.dataset.state = job.state;
    row.prepend(title, status);
    fragment.append(row);
  }
  $("#youtube-jobs").replaceChildren(fragment);
  $("#jobs-empty").hidden = jobs.length > 0;
  $("#job-count").textContent = jobs.length;
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
  if (!info.platforms)
    throw new Error(
      "Install the latest helper to enable additional platforms and photos.",
    );
  connected = true;
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
$("#youtube-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = normalizePost($("#youtube-url").value.trim())?.url;
  if (!url) {
    $("#youtube-status").textContent =
      "Enter a post link from YouTube, Instagram, X, Reddit, TikTok or Facebook.";
    $("#youtube-url").focus();
    return;
  }
  $("#youtube-download").disabled = true;
  try {
    if (!connected) await connect();
    const result = await request({
      type: "youtube-download",
      url,
      quality: $("#youtube-quality").value,
      mediaType: $("#media-kind").value,
      useBrowserSession: $("#use-browser-session").checked,
    });
    if (result.job?.outputDirectory) showFolder(result.job.outputDirectory);
    $("#youtube-status").textContent =
      "Download started. Check Activity for progress.";
    await refreshJobs();
  } catch (error) {
    $("#youtube-status").textContent = connected
      ? error.message
      : "Downloader unavailable. Open Settings to finish setup.";
    if (!connected) connectionState(false, error.message);
    if (!connected) $("#youtube-setup").hidden = false;
    $("#youtube-setup").open = true;
  } finally {
    $("#youtube-download").disabled = !connected;
  }
});
async function useSource() {
  const sourceHash = location.hash;
  const tabId = sourceHash ? Number(sourceHash.slice(1)) : undefined;
  try {
    const [source, preferences] = await Promise.all([
      request({ type: "youtube-source", tabId }),
      chrome.storage.local.get("popupDraft"),
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
    if (["video", "photos"].includes(draft?.mediaType))
      $("#media-kind").value = draft.mediaType;
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
