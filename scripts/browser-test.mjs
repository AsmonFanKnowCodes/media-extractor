import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "media-extractor-test-"));
const extension = path.join(temp, "extension");
await cp(path.join(root, "extension"), extension, { recursive: true });
// Only the temporary test copy receives localhost permission, so automated tests
// can exercise real scripting/download APIs without clicking browser chrome.
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json")),
);
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
const svg = (name) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#d7e2d0"/><circle cx="590" cy="120" r="64" fill="#f5e1a4"/><path d="M0 410 220 115 430 410 610 230 800 410V500H0" fill="#789384"/><path d="M0 440 200 300 450 500H0" fill="#36594b"/><text x="35" y="460" fill="white" font-family="sans-serif" font-size="22">${name}</text></svg>`;
const server = createServer((req, res) => {
  if (req.url === "/missing.jpg") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (/\.(svg|jpg)/.test(req.url)) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(svg(req.url.split("/").pop()));
    return;
  }
  if (req.url === "/clip.mp4") {
    res.setHeader("Content-Type", "video/mp4");
    res.end("test-video-download-bytes");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/frame") {
    res.end('<img src="/frame.svg">');
    return;
  }
  res.end(
    `<!doctype html><title>Mountain journal — media test</title><meta property="og:image" content="/social.svg"><h1>Mountain journal</h1><img src="/alpine.svg" alt="Alpine morning"><img src="/alpine.svg"><img src="/small.svg" srcset="/small.svg 1x, /large.svg 2x"><img data-src="/lazy.svg"><div style="width:100px;height:100px;background-image:url('/background.svg')"></div><video src="/clip.mp4" poster="/poster.svg"></video><a href="/playlist.m3u8">Stream</a><a href="/missing.jpg">Broken image</a><iframe src="/frame"></iframe><div id="shadow"></div><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<img src="/shadow.svg">'</script>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
    acceptDownloads: true,
  });
  const session = await context.browser().newBrowserCDPSession();
  await session.send("Extensions.loadUnpacked", { path: extension });
  await session.detach();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const source = await context.newPage();
  await source.goto(origin);
  await source.waitForLoadState("networkidle");
  const tabId = await worker.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.startsWith(origin));
    await chrome.storage.session.set({
      [`source-${tab.id}`]: { tabId: tab.id, title: tab.title, url: tab.url },
    });
    return tab.id;
  }, origin);
  const app = await context.newPage();
  const errors = [];
  app.on("pageerror", (error) => errors.push(error.message));
  await app.setViewportSize({ width: 1440, height: 1000 });
  await app.goto(`chrome-extension://${id}/app.html#${tabId}`);
  await app.getByRole("status").filter({ hasText: "Found" }).waitFor();
  const names = await app.locator(".card h3").allTextContents();
  for (const name of [
    "alpine.svg",
    "small.svg",
    "large.svg",
    "lazy.svg",
    "background.svg",
    "poster.svg",
    "social.svg",
    "shadow.svg",
    "frame.svg",
    "clip.mp4",
    "playlist.m3u8",
  ])
    assert.ok(names.includes(name), `Missing ${name}`);
  assert.equal(names.filter((n) => n === "alpine.svg").length, 1);
  console.log(
    "PASS: real extension scanner finds DOM, responsive, lazy, CSS, metadata, shadow, frame, video and stream media; deduplicates URLs.",
  );
  await app.locator('[data-filter="video"]').click();
  assert.equal(await app.locator(".card").count(), 2);
  await app.locator("#select-all").check();
  assert.equal(await app.locator("#selected").textContent(), "1 selected");
  await app.locator('[data-filter="image"]').click();
  await app.locator("#search").fill("alpine");
  assert.equal(await app.locator(".card").count(), 1);
  await app.locator("#select-all").check();
  assert.equal(await app.locator("#selected").textContent(), "2 selected");
  await app.locator("#download").click();
  await app.getByRole("status").filter({ hasText: "Started 2 of 2" }).waitFor();
  await app.waitForFunction(
    () =>
      document.querySelector(".download-state")?.textContent === "Downloaded",
  );
  await expect
    .poll(
      async () => {
        const downloads = await worker.evaluate(() =>
          chrome.downloads.search({}),
        );
        return downloads.map((d) => d.state);
      },
      { timeout: 20000 },
    )
    .toEqual(["complete", "complete"]);
  const downloads = await worker.evaluate(() => chrome.downloads.search({}));
  assert.equal(downloads.length, 2);
  assert.ok(
    downloads.every((d) => d.state === "complete"),
    JSON.stringify(
      downloads.map((d) => ({ state: d.state, error: d.error, url: d.url })),
    ),
  );
  console.log(
    "PASS: type filters, search, cross-filter selection, batch download through real Chrome downloads API and completion reporting.",
  );
  await app.locator("#search").fill("missing");
  await app.locator(".card button").click();
  await app.waitForFunction(() =>
    document
      .querySelector(".download-state")
      ?.textContent.startsWith("Failed:"),
  );
  console.log("PASS: failed download produces a visible per-file error.");
  await source.evaluate(() => {
    const img = document.createElement("img");
    img.src = "/new.svg";
    document.body.append(img);
  });
  await app.locator("#search").fill("");
  await app.locator('[data-filter="all"]').click();
  await app.locator("#scan").click();
  await app.locator(".card h3").filter({ hasText: "new.svg" }).waitFor();
  console.log("PASS: rescan discovers dynamically added images.");
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await app.screenshot({
    path: path.join(root, "test-results", "gallery-desktop.png"),
    fullPage: true,
  });
  await app.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await app.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await app.screenshot({
    path: path.join(root, "test-results", "gallery-mobile.png"),
    fullPage: true,
  });
  await app.locator("#search").fill("nothing-matches");
  assert.equal(await app.locator("#empty").isVisible(), true);
  await source.close();
  await app.locator("#scan").click();
  await app
    .getByRole("status")
    .filter({ hasText: "Scan could not finish" })
    .waitFor();
  assert.equal(await app.locator("#notice").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive layout, empty search, closed-tab error; no uncaught UI errors.",
  );
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
