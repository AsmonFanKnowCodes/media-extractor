import { normalizeYouTubeUrl } from "./youtube-url.js";

const $ = (selector) => document.querySelector(selector);
let connected = false,
  polling = false,
  outputDirectory = "";
let folderBusy = false;
function showFolder(folder) {
  outputDirectory = folder;
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
      : `Saved. Future downloads go to ${outputDirectory}`;
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
}
async function refreshJobs() {
  if (!connected || polling) return;
  polling = true;
  try {
    const result = await request({ type: "youtube-jobs" });
    showJobs(result.jobs);
  } catch (error) {
    connected = false;
    $("#youtube-status").textContent = error.message;
    $("#youtube-setup").hidden = false;
    $("#youtube-setup").open = true;
  } finally {
    polling = false;
  }
}
async function connect() {
  const info = await request({ type: "youtube-info" });
  connected = true;
  showFolder(info.outputDirectory);
  $("#youtube-status").textContent =
    `Downloader ready. Saves to ${outputDirectory}`;
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
    $("#youtube-status").textContent = error.message;
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
      `Download started. Files save to ${outputDirectory}`;
    await refreshJobs();
  } catch (error) {
    $("#youtube-status").textContent = error.message;
    if (!connected) $("#youtube-setup").hidden = false;
    $("#youtube-setup").open = true;
  } finally {
    $("#youtube-download").disabled = false;
  }
});
function useSource() {
  const sourceHash = location.hash;
  const tabId = Number(sourceHash.slice(1));
  if (!sourceHash || !Number.isInteger(tabId)) return;
  request({ type: "youtube-source", tabId })
    .then((source) => {
      if (location.hash === sourceHash)
        $("#youtube-url").value = source.url || "";
    })
    .catch(() => {
      /* Pasting a URL remains available if the source expired. */
    });
}
useSource();
window.addEventListener("hashchange", useSource);
connect().catch((error) => {
  $("#youtube-status").textContent = error.message;
  $("#youtube-setup").hidden = false;
  $("#youtube-setup").open = true;
});
setInterval(() => {
  if (!document.hidden) refreshJobs();
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshJobs();
});
