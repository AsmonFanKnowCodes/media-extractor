import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { extensionId } from "../helper/extension-id.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "media-scan-browser-"));
const extension = path.join(temp, "extension"),
  installation = path.join(temp, "installed");
const hostName = `com.personal.scan_test_${process.pid}_${Date.now()}`;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
await cp(path.join(root, "extension"), extension, { recursive: true });
await writeFile(
  path.join(extension, "background.js"),
  (await readFile(path.join(extension, "background.js"), "utf8")).replace(
    "com.personal.youtube_downloader",
    hostName,
  ),
);
const shipped = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
assert.ok(shipped.permissions.includes("scripting"));
assert.equal(shipped.host_permissions, undefined);
// Only the temporary copy gets fixture-host access. Real toolbar invocation grants activeTab.
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify({
    ...shipped,
    host_permissions: ["https://www.instagram.com/*"],
  }),
);
function run(command, args) {
  const r = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${r.stderr}\n${r.stdout}`);
}
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  await context.route("**/fixture-photo-*.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(png, "base64"),
    }),
  );
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: extension });
  await cdp.detach();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  assert.equal(await extensionId(extension), id);
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 420, height: 580 });
  await page.goto(`chrome-extension://${id}/app.html`);
  await expect(page.locator("#setup-banner")).toBeVisible();
  await page
    .getByRole("button", { name: "Help and installation", exact: true })
    .click();
  await expect(page.locator("#help-view")).toBeVisible();
  await page.locator('[data-view="download"]').click();
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "helper", "install.ps1"),
    "-Destination",
    installation,
    "-HostName",
    hostName,
    "-ExtensionId",
    id,
  ]);
  const compiler = path.join(
    process.env.WINDIR,
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  );
  const extractor = path.join(installation, "fixture-scanner.exe");
  run(compiler, [
    "/nologo",
    "/target:exe",
    "/reference:System.Web.Extensions.dll",
    `/out:${extractor}`,
    path.join(root, "tests", "FixtureScanner.cs"),
  ]);
  const toolsDir = path.join(installation, "fixture-tools");
  await mkdir(toolsDir);
  await writeFile(path.join(toolsDir, "ffmpeg.exe"), "fixture");
  run(compiler, [
    "/nologo",
    "/target:exe",
    `/out:${path.join(toolsDir, "ffprobe.exe")}`,
    path.join(root, "tests", "FixtureProbe.cs"),
  ]);
  const configPath = path.join(installation, "helper", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  Object.assign(config, {
    executable: extractor,
    galleryExecutable: extractor,
    ffmpegDirectory: toolsDir,
    outputDirectory: path.join(temp, "downloads"),
  });
  await writeFile(configPath, JSON.stringify(config));
  const managerPath = path.join(installation, "helper", "scan-manager.mjs");
  const managerText = await readFile(managerPath, "utf8");
  assert.ok(managerText.includes("const fetcher = options.fetcher || fetch;"));
  await writeFile(
    managerPath,
    managerText.replace(
      "const fetcher = options.fetcher || fetch;",
      `const fetcher=async(url,options)=>{if(String(url).includes('/fixture-photo-'))return new Response(Buffer.from('${png}','base64'));return fetch(url,options);};`,
    ),
  );
  await page.locator('[data-view="settings"]').click();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(page.locator("#connection-label")).toHaveText("Ready");
  await page.locator('[data-view="download"]').click();
  assert.equal(await page.locator("#media-kind").count(), 0);
  await page.locator("#youtube-url").fill("https://www.instagram.com/p/MIXED/");
  await page.getByRole("button", { name: "Scan link", exact: true }).click();
  await expect(page.locator(".scan-item")).toHaveCount(3, { timeout: 15000 });
  await expect(page.locator("#download-selected")).toHaveText(
    "Download 3 selected",
  );
  await page.locator(".scan-item input").nth(1).uncheck();
  await expect(page.locator("#download-selected")).toHaveText(
    "Download 2 selected",
  );
  await page.reload();
  await expect(page.locator(".scan-item")).toHaveCount(3);
  await expect(page.locator("#download-selected")).toHaveText(
    "Download 2 selected",
  );
  await page.locator("#youtube-quality").selectOption("1080");
  await page.locator("#download-selected").click();
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() =>
            chrome.runtime.sendMessage({ type: "youtube-jobs" }),
          )
        ).jobs[0]?.state,
    )
    .toBe("complete");
  const saved = (
    await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "youtube-jobs" }),
    )
  ).jobs[0];
  assert.equal(saved.files.length, 2);
  assert.ok(saved.files.some((f) => f.endsWith(".png")));
  assert.ok(saved.files.some((f) => f.endsWith(".mp4")));
  const picture = saved.files.find((f) => f.endsWith(".png"));
  assert.deepEqual(await readFile(picture), Buffer.from(png, "base64"));
  console.log(
    "PASS: mixed scan, selected download, byte-preserved image, video, selection restoration and scan/download Activity records.",
  );
  await page.locator('[data-view="download"]').click();
  await page.getByRole("button", { name: "Change link", exact: true }).click();
  await page.locator("#youtube-url").fill("https://www.instagram.com/p/FAIL/");
  await page.getByRole("button", { name: "Scan link", exact: true }).click();
  await expect(page.locator("#youtube-status")).toContainText(
    "Login required",
    { timeout: 15000 },
  );
  assert.equal(
    (
      await page.evaluate(() =>
        chrome.runtime.sendMessage({ type: "youtube-jobs" }),
      )
    ).jobs[0].state,
    "failed",
  );
  console.log(
    "PASS: failed scan preserves the actual extractor error and remains in Activity.",
  );
  await page.close();
  const html = `<!doctype html><title>Open carousel</title><script type="application/json">${JSON.stringify({ post: { code: "OPEN", carousel_media: [{ image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/fixture-photo-1.png", width: 1080, height: 1350 }] } }, { image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/fixture-photo-2.png", width: 1080, height: 1350 }] } }] } })}</script>`;
  await context.route("https://www.instagram.com/p/OPEN/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  const source = await context.newPage();
  await source.setViewportSize({ width: 1280, height: 900 });
  await source.goto("https://www.instagram.com/p/OPEN/");
  const before = await worker.evaluate(
    async () => (await chrome.tabs.query({})).length,
  );
  await worker.evaluate(() => chrome.action.openPopup());
  await expect
    .poll(async () =>
      worker.evaluate(
        async () =>
          (await chrome.runtime.getContexts({ contextTypes: ["POPUP"] }))
            .length,
      ),
    )
    .toBe(1);
  const inspector = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await inspector.send("Target.getTargets");
  const target = targetInfos.find(
    (t) =>
      t.url === `chrome-extension://${id}/app.html` &&
      t.type !== "service_worker",
  );
  assert.ok(target);
  const { sessionId } = await inspector.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  let sequence = 0;
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++sequence;
      const timer = setTimeout(() => {
        inspector.off("Target.receivedMessageFromTarget", listener);
        reject(new Error("Popup command timed out"));
      }, 10000);
      function listener(event) {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== requestId) return;
        clearTimeout(timer);
        inspector.off("Target.receivedMessageFromTarget", listener);
        result.error
          ? reject(new Error(result.error.message))
          : resolve(result.result);
      }
      inspector.on("Target.receivedMessageFromTarget", listener);
      inspector
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id: requestId, method, params }),
        })
        .catch(reject);
    });
  const evaluate = async (expression) =>
    (
      await command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  await expect
    .poll(() => evaluate("document.body.dataset.connection"))
    .toBe("ready");
  await expect
    .poll(() => evaluate('document.querySelector("#youtube-url").value'))
    .toBe("https://www.instagram.com/p/OPEN/");
  await evaluate('document.querySelector("#youtube-download").click()');
  await expect
    .poll(() => evaluate('document.querySelectorAll(".scan-item").length'), {
      timeout: 15000,
    })
    .toBe(2);
  await expect
    .poll(() =>
      evaluate('document.querySelector("#scan-warning-text").textContent'),
    )
    .toContain("Login required");
  const dimensions = await evaluate(
    '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,buttonBottom:document.querySelector("#download-selected").getBoundingClientRect().bottom,footerTop:document.querySelector("footer").getBoundingClientRect().top})',
  );
  assert.equal(dimensions.bodyWidth, 420);
  assert.ok(dimensions.scrollWidth <= dimensions.width);
  assert.ok(dimensions.buttonBottom <= dimensions.footerTop);
  await mkdir(path.join(root, "test-results"), { recursive: true });
  const screenshot = await command("Page.captureScreenshot");
  await writeFile(
    path.join(root, "test-results", "scan-popup.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  assert.equal(
    await worker.evaluate(async () => (await chrome.tabs.query({})).length),
    before,
  );
  await inspector.detach();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual Brave popup, unchanged active-link capture, scoped open-post fallback when APIs fail, mixed-result layout and no new tab.",
  );
} finally {
  await context?.close();
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `foreach($browser in @('Google\\Chrome','Microsoft\\Edge','BraveSoftware\\Brave-Browser')){$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\\$browser\\NativeMessagingHosts",$true);if($key){$key.DeleteSubKey('${hostName}',$false);$key.Dispose()}}`,
  ]);
  if (
    path.dirname(path.resolve(temp)) !== path.resolve(tmpdir()) ||
    !path.basename(temp).startsWith("media-scan-browser-")
  )
    throw new Error("Unexpected cleanup path");
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
