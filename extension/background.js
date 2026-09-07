import { normalizeYouTubeUrl } from "./youtube-url.js";

const HOST_NAME = "com.personal.youtube_downloader";
let nativePort;
let nextId = 1;
const pending = new Map();

function nativeRequest(method, params) {
  if (!nativePort) {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    const port = nativePort;
    port.onMessage.addListener((message) => {
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      message.ok
        ? entry.resolve(message)
        : entry.reject(
            new Error(message.error || "Downloader request failed."),
          );
    });
    port.onDisconnect.addListener(() => {
      const detail = chrome.runtime.lastError?.message || "Connection closed.";
      if (nativePort === port) nativePort = null;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(
          new Error(
            `The downloader could not connect. Run Install YouTube Downloader.exe once, then check the connection. ${detail}`,
          ),
        );
      }
      pending.clear();
    });
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(
      () => {
        pending.delete(id);
        reject(
          new Error(
            "Downloader response timed out. Check the recent downloads before retrying.",
          ),
        );
      },
      method === "choose-folder" ? 310000 : 20000,
    );
    pending.set(id, { resolve, reject, timer });
    try {
      nativePort.postMessage({ id, method, params });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}
chrome.action.onClicked.addListener(async (tab) => {
  const key = `source-${tab.id}`;
  await chrome.storage.session.set({
    [key]: { tabId: tab.id, title: tab.title || "Website", url: tab.url || "" },
  });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`app.html#${tab.id}`),
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL("app.html"))
  )
    return;
  (async () => {
    if (message.type === "youtube-info") return nativeRequest("info");
    if (message.type === "youtube-jobs") return nativeRequest("jobs");
    if (message.type === "youtube-choose-folder")
      return nativeRequest("choose-folder");
    if (message.type === "youtube-set-folder")
      return nativeRequest("set-folder", {
        outputDirectory: message.outputDirectory,
      });
    if (message.type === "youtube-download")
      return nativeRequest("download", {
        url: message.url,
        quality: message.quality,
      });
    if (message.type === "youtube-source") {
      const source = (
        await chrome.storage.session.get(`source-${message.tabId}`)
      )[`source-${message.tabId}`];
      return {
        url: normalizeYouTubeUrl(source?.url || "") || "",
        title: source?.title || "",
      };
    }
    throw new Error("Unknown request.");
  })()
    .then((result) => respond({ ok: true, ...result }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
