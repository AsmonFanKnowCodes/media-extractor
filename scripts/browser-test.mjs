import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createHelper } from "../helper/server.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "youtube-downloader-test-"));
const extension = path.join(temp, "extension");
await cp(path.join(root, "extension"), extension, { recursive: true });
const helperToken = "b".repeat(64);
const calls = [];
const helper = createHelper({
  token: helperToken,
  executable: "fixture-downloader",
  ffmpegDirectory: temp,
  outputDirectory: temp,
  spawnProcess: (_exe, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setTimeout(async () => {
      if (args.at(-1).endsWith("aaaaaaaaaaa")) {
        child.stderr.write("ERROR: Video unavailable.\n");
        child.emit("close", 1);
        return;
      }
      const filename = path.join(temp, "YouTube fixture with audio.mp4");
      await writeFile(filename, "fixture video and audio");
      child.stdout.write(
        `ME_PROGRESS 100.0%\nME_FILE ${JSON.stringify(filename)}\n`,
      );
      child.emit("close", 0);
    }, 250);
    return child;
  },
});
await new Promise((resolve) => helper.listen(0, "127.0.0.1", resolve));
const backgroundPath = path.join(extension, "background.js");
await writeFile(
  backgroundPath,
  (await readFile(backgroundPath, "utf8")).replace(
    "127.0.0.1:43127",
    `127.0.0.1:${helper.address().port}`,
  ),
);
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
  await worker.evaluate(async () => {
    await chrome.storage.session.set({
      "source-123": {
        url: "https://www.youtube.com/shorts/BaW_jenozKc",
        title: "YouTube fixture",
      },
    });
  });
  const app = await context.newPage();
  const errors = [];
  app.on("pageerror", (error) => errors.push(error.message));
  await app.setViewportSize({ width: 1440, height: 1100 });
  await app.goto(`chrome-extension://${id}/app.html#123`);
  await expect(app.locator("#youtube-url")).toHaveValue(
    "https://www.youtube.com/watch?v=BaW_jenozKc",
  );
  await expect(app.locator("#youtube-setup")).toHaveAttribute("open", "");
  assert.equal(
    await app.locator("#gallery,#scan,#search,#select-all,footer").count(),
    0,
  );
  const permissions = await worker.evaluate(() => chrome.permissions.getAll());
  assert.equal(permissions.permissions.includes("downloads"), false);
  assert.equal(permissions.permissions.includes("scripting"), false);
  const rejected = await app.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "download",
      item: { url: "https://example.com/image.jpg", type: "image" },
    }),
  );
  assert.equal(rejected.ok, false);
  console.log(
    "PASS: dedicated YouTube UI, source autofill, removed scanner/download permissions and rejected legacy download route.",
  );
  await app.locator("#youtube-token").fill("c".repeat(64));
  await app
    .getByRole("button", { name: "Connect helper", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText("did not match");
  await app.locator("#youtube-token").fill(helperToken);
  await app
    .getByRole("button", { name: "Connect helper", exact: true })
    .click();
  await expect(app.locator("#youtube-status")).toContainText(
    "Helper connected",
  );
  await app.locator("#youtube-quality").selectOption("720");
  await app
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect(app.locator('.youtube-job[data-state="complete"]')).toHaveCount(
    1,
  );
  assert.match(calls[0][calls[0].indexOf("-f") + 1], /height<=720/);
  await expect(app.locator("#jobs-empty")).toBeHidden();
  await app.locator("#youtube-url").fill("https://youtu.be/aaaaaaaaaaa");
  await app
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect(app.locator('.youtube-job[data-state="failed"]')).toHaveCount(1);
  await app.reload();
  await expect(app.locator("#youtube-status")).toContainText(
    "Helper connected",
  );
  await expect(app.locator(".youtube-job")).toHaveCount(2);
  console.log(
    "PASS: pairing failure/success, quality submission, completed/failed jobs, persisted pairing and restored recent jobs.",
  );
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await app.screenshot({
    path: path.join(root, "test-results", "youtube-desktop.png"),
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
    path: path.join(root, "test-results", "youtube-mobile.png"),
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
    "PASS: responsive layout, expired source fallback, invalid URL feedback, no uncaught errors.",
  );
} finally {
  await context?.close();
  await new Promise((resolve) => helper.close(resolve));
  if (
    path.dirname(path.resolve(temp)) !== path.resolve(tmpdir()) ||
    !path.basename(temp).startsWith("youtube-downloader-test-")
  )
    throw new Error("Unexpected test cleanup path");
  await rm(temp, { recursive: true, force: true });
}
