import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeYouTubeUrl } from "../extension/youtube-url.js";

const url = normalizeYouTubeUrl(process.argv[2]);
if (!url) throw new Error("Pass a YouTube video URL to download.");
const root = path.resolve(import.meta.dirname, "..");
const profile = await mkdtemp(path.join(tmpdir(), "youtube-live-test-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : { channel: "chromium" }),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked", {
    path: path.join(root, "extension"),
  });
  await session.detach();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/app.html`);
  await expect(page.locator("#youtube-status")).toContainText(
    "Downloader ready",
    { timeout: 20000 },
  );
  await page.locator("#youtube-url").fill(url);
  await page.locator("#youtube-quality").selectOption("720");
  await page
    .getByRole("button", { name: "Download video ↓", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const state = await page
          .locator(".youtube-job")
          .first()
          .getAttribute("data-state");
        if (state === "failed")
          throw new Error(
            await page.locator(".youtube-job").first().textContent(),
          );
        return state;
      },
      { timeout: 120000, intervals: [1000, 2000] },
    )
    .toBe("complete");
  console.log(await page.locator(".youtube-job").first().innerText());
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "test-results", "native-live-download.png"),
    fullPage: true,
  });
} finally {
  await context?.close();
  if (
    path.dirname(path.resolve(profile)) !== path.resolve(tmpdir()) ||
    !path.basename(profile).startsWith("youtube-live-test-")
  )
    throw new Error("Unexpected cleanup path");
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
