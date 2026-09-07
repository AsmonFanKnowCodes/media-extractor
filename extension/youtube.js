import { normalizeYouTubeUrl } from "./youtube-url.js";

const $ = (selector) => document.querySelector(selector);
let connected = false,
  polling = false,
  outputDirectory = "";
let folderBusy = false;
let sourceUrl = "";
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
    row.dataset.state = job.state;
    row.append(title, status);
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
  const url = normalizeYouTubeUrl($("#youtube-url").value.trim());
  if (!url) {
    $("#youtube-status").textContent =
      "Enter a single YouTube video or Shorts link.";
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
    $("#youtube-download").disabled = false;
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
    const draft = preferences.popupDraft;
    $("#youtube-url").value =
      draft?.sourceUrl === sourceUrl
        ? draft.url
        : sourceUrl || (!sourceHash ? draft?.url || "" : "");
    if (["720", "1080", "best"].includes(draft?.quality))
      $("#youtube-quality").value = draft.quality;
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
