import { downloadable } from "./core.js";

const $ = (selector) => document.querySelector(selector);
const tabId = Number(location.hash.slice(1));
let items = [],
  filter = "all",
  busy = false;
const selected = new Set();
const downloadIds = new Map();
const states = new Map();
let queueing = false;

function visibleItems() {
  const query = $("#search").value.trim().toLowerCase();
  return items.filter(
    (item) =>
      (filter === "all" ||
        (filter === "video" ? item.type !== "image" : item.type === "image")) &&
      `${item.url} ${item.alt}`.toLowerCase().includes(query),
  );
}
function labelFor(item) {
  if (item.url.startsWith("data:")) return item.alt || "Embedded image";
  try {
    return (
      decodeURIComponent(new URL(item.url).pathname.split("/").pop()) ||
      item.alt ||
      "Untitled media"
    );
  } catch {
    return item.alt || "Media file";
  }
}
function syncSelection() {
  const available = visibleItems().filter(downloadable);
  const count = available.filter((item) => selected.has(item.url)).length;
  $("#select-all").checked = available.length > 0 && count === available.length;
  $("#select-all").indeterminate = count > 0 && count < available.length;
  $("#select-all").disabled = busy || !available.length;
  $("#selected").textContent = `${selected.size} selected`;
  $("#download").disabled = busy || queueing || !selected.size;
}
function updateState(url, text) {
  states.set(url, text);
  for (const card of document.querySelectorAll(".card")) {
    if (card.dataset.url === url)
      card.querySelector(".download-state").textContent = text;
  }
}
async function startDownload(item) {
  updateState(item.url, "Starting download…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "download", item });
    if (!result?.ok) throw new Error(result?.error || "Download failed.");
    downloadIds.set(result.id, item.url);
    updateState(item.url, "Downloading…");
    // Reconcile downloads that finish before the event listener knows their ID.
    const [download] = await chrome.downloads.search({ id: result.id });
    if (download?.state === "complete") updateState(item.url, "Downloaded");
    if (download?.state === "interrupted")
      updateState(
        item.url,
        `Failed: ${download.error || "download interrupted"}`,
      );
    return true;
  } catch (error) {
    updateState(item.url, `Failed: ${error.message}`);
    return false;
  }
}
function render() {
  const visible = visibleItems();
  const gallery = $("#gallery");
  gallery.replaceChildren();
  $("#visible-count").textContent = `${visible.length} shown`;
  $("#empty").hidden = busy || visible.length > 0;
  if (!busy && items.length) {
    $("#empty h2").textContent = "No matches this time.";
    $("#empty p").textContent = "Try a different search or media filter.";
  }
  for (const item of visible) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.url = item.url;
    const preview = document.createElement("div");
    preview.className = "preview";
    const fallback = document.createElement("span");
    fallback.className = "fallback";
    fallback.textContent =
      item.type === "image" ? "Preview unavailable" : "Video file";
    preview.append(fallback);
    if (item.type === "image" && !item.url.startsWith("blob:")) {
      const img = document.createElement("img");
      img.alt = item.alt || labelFor(item);
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.src = item.url;
      fallback.hidden = true;
      img.onerror = () => {
        img.remove();
        fallback.hidden = false;
      };
      preview.append(img);
    } else if (item.type === "video" && downloadable(item)) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "none";
      video.src = item.url;
      video.setAttribute("aria-label", labelFor(item));
      fallback.hidden = true;
      video.onerror = () => {
        video.remove();
        fallback.hidden = false;
      };
      preview.append(video);
    }
    const pick = document.createElement("label");
    pick.className = "pick";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select ${labelFor(item)}`);
    checkbox.checked = selected.has(item.url);
    checkbox.disabled = !downloadable(item);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? selected.add(item.url) : selected.delete(item.url);
      syncSelection();
    });
    pick.append(checkbox);
    preview.append(pick);
    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h3");
    title.textContent = labelFor(item);
    title.title = item.url.startsWith("data:") ? title.textContent : item.url;
    const meta = document.createElement("div");
    meta.className = "meta";
    const type = document.createElement("span");
    type.textContent =
      item.type === "stream" ? "STREAM" : item.type.toUpperCase();
    const dimensions = document.createElement("span");
    dimensions.textContent = item.width
      ? `${item.width} × ${item.height}`
      : item.source;
    meta.append(type, dimensions);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const download = document.createElement("button");
    download.textContent = downloadable(item) ? "Download ↓" : "Unavailable";
    download.disabled = !downloadable(item);
    download.addEventListener("click", async () => {
      download.disabled = true;
      await startDownload(item);
      download.disabled = false;
    });
    actions.append(download);
    if (/^https?:/i.test(item.url)) {
      const open = document.createElement("a");
      open.textContent = "Open ↗";
      open.href = item.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.setAttribute("aria-label", `Open ${labelFor(item)} in a new tab`);
      actions.append(open);
    }
    const state = document.createElement("p");
    state.className = "download-state";
    state.textContent =
      states.get(item.url) ||
      (downloadable(item)
        ? ""
        : "Stream or temporary URL — no direct download.");
    body.append(title, meta, actions, state);
    card.append(preview, body);
    gallery.append(card);
  }
  syncSelection();
}

async function scan() {
  busy = true;
  $("#scan").disabled = true;
  $("#scan").textContent = "Scanning…";
  $("#status").textContent = "Looking for images and videos on your page…";
  $("#notice").hidden = true;
  $("#gallery").replaceChildren();
  $("#empty").hidden = true;
  syncSelection();
  try {
    const result = await chrome.runtime.sendMessage({ type: "scan", tabId });
    if (!result?.ok)
      throw new Error(result?.error || "Could not connect to the extension.");
    items = result.items;
    for (const url of selected)
      if (!items.some((item) => item.url === url)) selected.delete(url);
    $("#source-title").textContent = result.title || "Untitled page";
    $("#source-url").textContent = result.url;
    $("#status").textContent =
      `Found ${items.length} unique media files. Select your favorites to download.`;
    $("#empty h2").textContent = "No media found yet.";
    $("#empty p").textContent =
      "Scroll the source page or start its video, then rescan.";
    if (result.inaccessibleFrames) {
      $("#notice").hidden = false;
      $("#notice").textContent =
        `${result.inaccessibleFrames} embedded frame(s) could not be scanned. Open the embedded website directly and click the extension there.`;
    }
  } catch (error) {
    items = [];
    selected.clear();
    $("#status").textContent = "Scan could not finish.";
    $("#notice").hidden = false;
    $("#notice").textContent =
      `${error.message} Browser settings, extension stores, and closed tabs cannot be scanned. Return to a normal website and click the extension icon again.`;
    $("#empty h2").textContent = "Let’s start with a website.";
    $("#empty p").textContent =
      "Click Media Extractor from the page you want to scan.";
  } finally {
    busy = false;
    $("#scan").disabled = false;
    $("#scan").textContent = "Rescan page ↻";
    $("#total").textContent = `${items.length} files`;
    $("#count-all").textContent = items.length;
    $("#count-image").textContent = items.filter(
      (item) => item.type === "image",
    ).length;
    $("#count-video").textContent = items.filter(
      (item) => item.type !== "image",
    ).length;
    render();
  }
}
for (const button of document.querySelectorAll("[data-filter]"))
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    for (const candidate of document.querySelectorAll("[data-filter]"))
      candidate.setAttribute("aria-pressed", String(candidate === button));
    render();
  });
$("#search").addEventListener("input", render);
$("#select-all").addEventListener("change", (event) => {
  for (const item of visibleItems().filter(downloadable))
    event.target.checked ? selected.add(item.url) : selected.delete(item.url);
  render();
});
$("#scan").addEventListener("click", scan);
$("#download").addEventListener("click", async () => {
  queueing = true;
  syncSelection();
  const batch = items.filter(
    (item) => selected.has(item.url) && downloadable(item),
  );
  let started = 0;
  for (const item of batch) {
    if (await startDownload(item)) {
      started++;
      selected.delete(item.url);
    }
  }
  queueing = false;
  render();
  $("#status").textContent =
    `Started ${started} of ${batch.length} downloads. Check each card or View downloads for completion.`;
});
$("#downloads").addEventListener("click", () =>
  chrome.tabs.create({ url: "chrome://downloads/" }),
);
chrome.downloads.onChanged.addListener((delta) => {
  const url = downloadIds.get(delta.id);
  if (!url) return;
  if (delta.state?.current === "complete") updateState(url, "Downloaded");
  if (delta.state?.current === "interrupted")
    updateState(
      url,
      `Failed: ${delta.error?.current || "download interrupted"}`,
    );
});
if (location.hash && Number.isInteger(tabId)) scan();
else {
  $("#scan").disabled = true;
  render();
}
