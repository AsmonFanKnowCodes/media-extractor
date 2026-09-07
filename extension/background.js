import { scanPage } from "./scanner.js";
import { downloadable, filenameFor, mergeMedia } from "./core.js";

async function helperRequest(route, { token, body } = {}) {
  token ||= (await chrome.storage.local.get("helperToken")).helperToken;
  if (!token)
    throw new Error("Connect the YouTube helper first using its pairing key.");
  let response;
  try {
    response = await fetch(`http://127.0.0.1:43127/v1/${route}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error(
      "The YouTube helper is not reachable. Open Start YouTube Helper.cmd, then try again.",
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "The helper could not complete the request.",
    );
  return result;
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
    if (message.type === "youtube-connect") {
      if (!/^[a-f0-9]{64}$/.test(message.token || ""))
        throw new Error("Paste the full pairing key from the helper window.");
      const result = await helperRequest("info", { token: message.token });
      await chrome.storage.local.set({ helperToken: message.token });
      return result;
    }
    if (message.type === "youtube-info") return helperRequest("info");
    if (message.type === "youtube-jobs") return helperRequest("jobs");
    if (message.type === "youtube-download")
      return helperRequest("jobs", {
        body: { url: message.url, quality: message.quality },
      });
    if (message.type === "scan") {
      const source = (
        await chrome.storage.session.get(`source-${message.tabId}`)
      )[`source-${message.tabId}`];
      if (!source)
        throw new Error(
          "Open a website and click the Media Extractor extension icon to start.",
        );
      const results = await chrome.scripting.executeScript({
        target: { tabId: source.tabId },
        func: scanPage,
      });
      const frames = results.map((r) => r.result).filter(Boolean);
      return {
        items: mergeMedia(frames),
        title: frames[0]?.title,
        url: frames[0]?.url,
        inaccessibleFrames: frames.reduce(
          (n, f) => n + f.inaccessibleFrames,
          0,
        ),
      };
    }
    if (message.type === "download") {
      if (!message.item || !downloadable(message.item))
        throw new Error("This media cannot be downloaded as a direct file.");
      const id = await chrome.downloads.download({
        url: message.item.url,
        filename: filenameFor(message.item),
        conflictAction: "uniquify",
        saveAs: false,
      });
      return { id };
    }
    throw new Error("Unknown request.");
  })()
    .then((result) => respond({ ok: true, ...result }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
