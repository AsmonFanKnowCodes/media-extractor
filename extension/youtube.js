import { normalizeYouTubeUrl } from "./youtube-url.js";

const $ = (selector) => document.querySelector(selector);
let connected = false,
  polling = false,
  outputDirectory = "";
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
    row.dataset.state = job.state;
    row.append(title, status);
    fragment.append(row);
  }
  $("#youtube-jobs").replaceChildren(fragment);
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
    $("#youtube-setup").open = true;
  } finally {
    polling = false;
  }
}
async function connect(token) {
  const info = await request(
    token ? { type: "youtube-connect", token } : { type: "youtube-info" },
  );
  connected = true;
  outputDirectory = info.outputDirectory;
  $("#youtube-status").textContent =
    `Helper connected. Saves to ${outputDirectory}`;
  $("#youtube-setup").open = false;
  await refreshJobs();
}
$("#youtube-connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await connect($("#youtube-token").value.trim());
    $("#youtube-token").value = "";
  } catch (error) {
    $("#youtube-status").textContent = error.message;
  } finally {
    button.disabled = false;
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
    await request({
      type: "youtube-download",
      url,
      quality: $("#youtube-quality").value,
    });
    $("#youtube-status").textContent =
      `Download started. Files save to ${outputDirectory}`;
    await refreshJobs();
  } catch (error) {
    $("#youtube-status").textContent = error.message;
    if (!connected) $("#youtube-setup").open = true;
  } finally {
    $("#youtube-download").disabled = false;
  }
});
// The scan may finish before or after this module loads. Observe the source URL.
function useSource() {
  const url = normalizeYouTubeUrl($("#source-url").textContent.trim());
  if (url) {
    $("#youtube-url").value = url;
    $("#youtube-panel").open = true;
  }
}
new MutationObserver(useSource).observe($("#source-url"), {
  childList: true,
  subtree: true,
  characterData: true,
});
useSource();
if (!location.hash) $("#youtube-panel").open = true;
connect().catch((error) => {
  $("#youtube-status").textContent = error.message;
  $("#youtube-setup").open = true;
});
setInterval(() => {
  if (!document.hidden) refreshJobs();
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshJobs();
});
