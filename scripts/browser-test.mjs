import { chromium, expect } from "@playwright/test";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  mkdir,
  rm,
  realpath,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { extensionId } from "../helper/extension-id.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "youtube-native-test-"));
const extension = path.join(temp, "extension");
const installation = path.join(temp, "installed");
const hostName = `com.personal.youtube_downloader_test_${Date.now()}`;
await cp(path.join(root, "extension"), extension, { recursive: true });
const backgroundPath = path.join(extension, "background.js");
await writeFile(
  backgroundPath,
  (await readFile(backgroundPath, "utf8")).replace(
    "com.personal.youtube_downloader",
    hostName,
  ),
);
function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr}\n${result.stdout}`);
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
  const session = await context.browser().newBrowserCDPSession();
  await session.send("Extensions.loadUnpacked", { path: extension });
  await session.detach();
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  assert.equal(
    await extensionId(extension),
    id,
    "Installer must derive the exact ID used by Chromium.",
  );
  await worker.evaluate(async () => {
    await chrome.storage.session.set({
      "source-123": {
        url: "https://www.youtube.com/shorts/BaW_jenozKc",
        title: "YouTube fixture",
      },
    });
  });
  let app = await context.newPage();
  const errors = [];
  app.on("pageerror", (error) => errors.push(error.message));
  await app.setViewportSize({ width: 420, height: 580 });
  await app.goto(`chrome-extension://${id}/app.html#123`);
  await expect(app.locator("#youtube-url")).toHaveValue(
    "https://www.youtube.com/watch?v=BaW_jenozKc",
  );
  await expect(app.locator("#connection-detail")).toContainText(
    "Install YouTube Downloader.exe",
  );
  assert.equal(await app.locator("#youtube-token,#gallery,#scan").count(), 0);
  await expect(app.locator("#setup-banner")).toBeVisible();
  await expect(
    app.getByRole("img", { name: "YouTube", exact: true }),
  ).toBeVisible();
  await expect(app.locator("#youtube-download")).toBeHidden();
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await app.screenshot({
    path: path.join(root, "test-results", "popup-setup-state.png"),
    clip: { x: 0, y: 0, width: 420, height: 512 },
  });
  await app.getByRole("button", { name: "Set up", exact: true }).click();
  await expect(app.locator("#settings-view")).toBeVisible();
  const permissions = await worker.evaluate(() => chrome.permissions.getAll());
  assert.ok(permissions.permissions.includes("nativeMessaging"));
  assert.equal((permissions.origins || []).length, 0);
  console.log(
    "PASS: missing-installation feedback, source autofill, no pairing field or localhost permission; exact Windows extension ID derivation.",
  );

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
  const fixture = path.join(installation, "fixture-downloader.exe");
  run(compiler, [
    "/nologo",
    "/target:exe",
    "/reference:System.Web.Extensions.dll",
    `/out:${fixture}`,
    path.join(root, "tests", "FixtureDownloader.cs"),
  ]);
  const configPath = path.join(installation, "helper", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.executable = fixture;
  config.outputDirectory = path.join(temp, "downloads");
  await writeFile(configPath, JSON.stringify(config));
  run(compiler, [
    "/nologo",
    "/target:exe",
    `/out:${path.join(installation, "folder-picker.exe")}`,
    path.join(root, "tests", "FixtureFolderPicker.cs"),
  ]);
  const canonicalTemp = await realpath(temp);
  const typedFolder = path.join(canonicalTemp, "custom videos 日本語");
  const pickedFolder = path.join(canonicalTemp, "picked videos");
  const nextFolder = path.join(canonicalTemp, "next downloads");
  await Promise.all(
    [typedFolder, pickedFolder, nextFolder].map((folder) =>
      mkdir(folder, { recursive: true }),
    ),
  );
  await app.locator('[data-view="settings"]').click();
  await app
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Ready to download.",
    { timeout: 20000 },
  );
  await app.locator('[data-view="download"]').click();
  await app.locator("#youtube-quality").selectOption("720");
  await app.locator('[data-view="settings"]').click();
  await app.locator("#save-folder").fill("relative-folder");
  await app.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(app.locator("#folder-status")).toContainText(
    "Folder not changed",
  );
  await app.locator("#save-folder").fill(typedFolder);
  await app.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(app.locator("#folder-status")).toContainText(
    "Saved for future downloads.",
  );
  await app.getByRole("button", { name: "Browse…", exact: true }).click();
  await expect(app.locator("#save-folder")).toHaveValue(pickedFolder);
  await writeFile(path.join(temp, "cancel-picker"), "");
  await app.getByRole("button", { name: "Browse…", exact: true }).click();
  await expect(app.locator("#folder-status")).toContainText("Folder unchanged");
  await app.locator('[data-view="download"]').click();
  await app
    .getByRole("button", { name: "Download video", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Download started",
  );
  await app.locator('[data-view="settings"]').click();
  await app.locator("#save-folder").fill(nextFolder);
  await app.getByRole("button", { name: "Save folder", exact: true }).click();
  await expect(app.locator("#folder-status")).toContainText(
    "Saved for future downloads.",
  );
  await app.close();
  if (process.env.NATIVE_IDLE_TEST === "1")
    await new Promise((resolve) => setTimeout(resolve, 35000));
  app = await context.newPage();
  app.on("pageerror", (error) => errors.push(error.message));
  await app.setViewportSize({ width: 420, height: 580 });
  await app.goto(`chrome-extension://${id}/app.html#123`);
  await expect(app.locator("#youtube-status")).toContainText(
    "Ready to download.",
  );
  await expect(app.locator('.youtube-job[data-state="complete"]')).toHaveCount(
    1,
    { timeout: 15000 },
  );
  const args = JSON.parse(
    await readFile(path.join(pickedFolder, "fixture-args.json"), "utf8"),
  );
  assert.match(args[args.indexOf("-f") + 1], /height<=720/);
  assert.equal(args[args.indexOf("-P") + 1], pickedFolder);
  await expect(app.locator("#save-folder")).toHaveValue(nextFolder);
  assert.equal(
    JSON.parse(await readFile(configPath, "utf8")).outputDirectory,
    nextFolder,
  );
  console.log(
    "PASS: saved destination, typed Unicode paths, folder picker/cancel bridge, invalid path rejection, persistence and in-flight download destination preserved.",
  );
  await expect(app.locator("#jobs-empty")).toBeHidden();
  await app.locator("#youtube-url").fill("https://youtu.be/aaaaaaaaaaa");
  await app.locator('[data-view="download"]').click();
  await app
    .getByRole("button", { name: "Download video", exact: true })
    .click();
  await expect(app.locator('.youtube-job[data-state="failed"]')).toHaveCount(1);
  await app.reload();
  await expect(app.locator("#youtube-status")).toContainText(
    "Ready to download.",
  );
  await expect(app.locator(".youtube-job")).toHaveCount(2);
  console.log(
    "PASS: real Windows registration and native EXE startup, automatic reconnect, quality selection, download continuing after tab closure, saved file and error reporting (fixture downloader).",
  );
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await app.screenshot({
    path: path.join(root, "test-results", "popup-download.png"),
    fullPage: true,
  });
  await app.goto(`chrome-extension://${id}/app.html#999`);
  await expect(app.locator("#youtube-url")).toHaveValue("");
  await app.locator("#youtube-url").fill("https://example.com/video");
  await app.locator('[data-view="download"]').click();
  await app
    .getByRole("button", { name: "Download video", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Enter a single YouTube",
  );
  assert.deepEqual(errors, []);
  await app.setViewportSize({ width: 1280, height: 900 });
  await worker.evaluate(() =>
    chrome.storage.local.set({
      popupDraft: {
        sourceUrl: "",
        url: "https://youtu.be/BaW_jenozKc",
        quality: "1080",
      },
    }),
  );
  const tabCountBefore = await worker.evaluate(
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
  const tabCountAfter = await worker.evaluate(
    async () => (await chrome.tabs.query({})).length,
  );
  const popupUrl = `chrome-extension://${id}/app.html`;
  const popupSession = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await popupSession.send("Target.getTargets");
  const popupTarget = targetInfos.find(
    (target) => target.url === popupUrl && target.type !== "service_worker",
  );
  assert.ok(popupTarget, "Native popup target must exist.");
  const { sessionId: popupSessionId } = await popupSession.send(
    "Target.attachToTarget",
    { targetId: popupTarget.targetId, flatten: false },
  );
  let popupCommandId = 0;
  async function popupCommand(method, params = {}) {
    const commandId = ++popupCommandId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        popupSession.off("Target.receivedMessageFromTarget", listener);
        reject(new Error("Popup inspection timed out"));
      }, 5000);
      function listener(event) {
        if (event.sessionId !== popupSessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== commandId) return;
        clearTimeout(timer);
        popupSession.off("Target.receivedMessageFromTarget", listener);
        message.error
          ? reject(new Error(message.error.message))
          : resolve(message.result);
      }
      popupSession.on("Target.receivedMessageFromTarget", listener);
      popupSession
        .send("Target.sendMessageToTarget", {
          sessionId: popupSessionId,
          message: JSON.stringify({ id: commandId, method, params }),
        })
        .catch(reject);
    });
  }
  await expect
    .poll(
      async () =>
        (
          await popupCommand("Runtime.evaluate", {
            expression: "document.body.dataset.connection",
            returnByValue: true,
          })
        ).result.value,
    )
    .toBe("ready");
  await popupCommand("Runtime.evaluate", {
    expression:
      "document.fonts.ready.then(()=>new Promise(resolve=>setTimeout(resolve,200)))",
    awaitPromise: true,
  });
  const geometry = await popupCommand("Runtime.evaluate", {
    expression:
      '({width:innerWidth,height:innerHeight,bodyWidth:document.body.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,buttonBottom:document.querySelector("#youtube-download").getBoundingClientRect().bottom,footerTop:document.querySelector("footer").getBoundingClientRect().top})',
    returnByValue: true,
  });
  const popupSize = geometry.result.value;
  const designAudit = await popupCommand("Runtime.evaluate", {
    expression: `({
    logoLoaded:document.querySelector('.service-logo').complete && document.querySelector('.service-logo').naturalWidth>0,
    primaryColor:getComputedStyle(document.querySelector('.primary')).backgroundColor,
    shadowCount:[...document.querySelectorAll('*')].filter(el=>getComputedStyle(el).boxShadow!=='none').length,
    weights:[...new Set([...document.querySelectorAll('*')].map(el=>getComputedStyle(el).fontWeight))]
  })`,
    returnByValue: true,
  });
  assert.equal(
    designAudit.result.value.logoLoaded,
    true,
    "Official YouTube asset must load locally.",
  );
  assert.equal(designAudit.result.value.primaryColor, "rgb(0, 113, 227)");
  assert.equal(
    designAudit.result.value.shadowCount,
    0,
    "The supplied design system has no shadows.",
  );
  assert.ok(
    designAudit.result.value.weights.every((weight) =>
      ["400", "600", "700"].includes(weight),
    ),
  );
  console.log("Actual popup geometry:", JSON.stringify(popupSize));
  await popupCommand("Runtime.evaluate", {
    expression: "new Promise(resolve=>setTimeout(resolve,250))",
    awaitPromise: true,
  });
  const screenshot = await popupCommand("Page.captureScreenshot");
  await writeFile(
    path.join(root, "test-results", "actual-brave-popup.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  await popupSession.detach();
  assert.ok(
    popupSize.width >= 420 && popupSize.width <= 440,
    "Native popup must fit 420px content plus any browser gutter.",
  );
  assert.equal(popupSize.bodyWidth, 420);
  assert.ok(
    popupSize.scrollWidth <= popupSize.width,
    "Native popup must have no horizontal overflow.",
  );
  assert.ok(
    popupSize.buttonBottom <= popupSize.footerTop,
    "Download button must remain above the footer.",
  );
  assert.equal(
    tabCountAfter,
    tabCountBefore,
    "The toolbar popup must not create a browser tab.",
  );
  console.log(
    "PASS: actual Brave action popup opens, with no new browser tab.",
  );
  console.log(
    "PASS: responsive layout, expired-source fallback and invalid URL feedback; no uncaught UI errors.",
  );
} finally {
  await context?.close();
  // Delete only this run's uniquely named native host registry keys.
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `foreach ($browser in @('Google\\Chrome','Microsoft\\Edge','BraveSoftware\\Brave-Browser')) { $parent=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\\$browser\\NativeMessagingHosts",$true); if($parent) { $parent.DeleteSubKey('${hostName}',$false); $parent.Dispose() } }`,
  ]);
  if (
    path.dirname(path.resolve(temp)) !== path.resolve(tmpdir()) ||
    !path.basename(temp).startsWith("youtube-native-test-")
  )
    throw new Error("Unexpected test cleanup path");
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
