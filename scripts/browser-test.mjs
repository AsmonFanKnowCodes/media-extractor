import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
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
  await app.setViewportSize({ width: 1440, height: 1100 });
  await app.goto(`chrome-extension://${id}/app.html#123`);
  await expect(app.locator("#youtube-url")).toHaveValue(
    "https://www.youtube.com/watch?v=BaW_jenozKc",
  );
  await expect(app.locator("#youtube-status")).toContainText(
    "Install YouTube Downloader.exe",
  );
  assert.equal(
    await app.locator("#youtube-token,#gallery,#scan,footer").count(),
    0,
  );
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
  await app
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Downloader ready",
    { timeout: 20000 },
  );
  await app.locator("#youtube-quality").selectOption("720");
  await app
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Download started",
  );
  await app.close();
  if (process.env.NATIVE_IDLE_TEST === "1")
    await new Promise((resolve) => setTimeout(resolve, 35000));
  app = await context.newPage();
  app.on("pageerror", (error) => errors.push(error.message));
  await app.setViewportSize({ width: 1440, height: 1100 });
  await app.goto(`chrome-extension://${id}/app.html#123`);
  await expect(app.locator("#youtube-status")).toContainText(
    "Downloader ready",
  );
  await expect(app.locator('.youtube-job[data-state="complete"]')).toHaveCount(
    1,
    { timeout: 15000 },
  );
  const args = JSON.parse(
    await readFile(
      path.join(config.outputDirectory, "fixture-args.json"),
      "utf8",
    ),
  );
  assert.match(args[args.indexOf("-f") + 1], /height<=720/);
  await expect(app.locator("#jobs-empty")).toBeHidden();
  await app.locator("#youtube-url").fill("https://youtu.be/aaaaaaaaaaa");
  await app
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect(app.locator('.youtube-job[data-state="failed"]')).toHaveCount(1);
  await app.reload();
  await expect(app.locator("#youtube-status")).toContainText(
    "Downloader ready",
  );
  await expect(app.locator(".youtube-job")).toHaveCount(2);
  console.log(
    "PASS: real Windows registration and native EXE startup, automatic reconnect, quality selection, download continuing after tab closure, saved file and error reporting (fixture downloader).",
  );
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await app.screenshot({
    path: path.join(root, "test-results", "native-desktop.png"),
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
    path: path.join(root, "test-results", "native-mobile.png"),
    fullPage: true,
  });
  await app.goto(`chrome-extension://${id}/app.html#999`);
  await expect(app.locator("#youtube-url")).toHaveValue("");
  await app.locator("#youtube-url").fill("https://example.com/video");
  await app
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Enter a single YouTube",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive layout, expired-source fallback and invalid URL feedback; no uncaught UI errors.",
  );
} finally {
  await context?.close();
  // Delete only this run's uniquely named native host registry keys.
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `foreach ($browser in @('Google\\Chrome','Microsoft\\Edge')) { $parent=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\\$browser\\NativeMessagingHosts",$true); if($parent) { $parent.DeleteSubKey('${hostName}',$false); $parent.Dispose() } }`,
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
