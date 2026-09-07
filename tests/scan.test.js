import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createScanManager, savePhoto } from "../helper/scan-manager.mjs";
import {
  extractorError,
  galleryAssets,
  chooseFormats,
} from "../helper/scan-parser.mjs";
import { collectPostMedia } from "../extension/collect-post.js";
import { trustedMediaUrl } from "../helper/media-policy.mjs";
import { normalizePost } from "../extension/platforms.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const photo = "https://scontent.cdninstagram.com/photo.png";
async function until(done) {
  for (let i = 0; i < 300; i++) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Job did not finish");
}
test("extractor error records are surfaced even when the process exits successfully", () => {
  assert.match(
    extractorError("", [[-1, { message: "HTTP redirect to login page" }]]),
    /login/,
  );
  assert.match(
    extractorError("[tiktok][error] Failed to extract post (403 Forbidden)"),
    /403/,
  );
  assert.equal(
    galleryAssets([[3, photo, { extension: "png" }]], "instagram").length,
    1,
  );
  assert.equal(
    galleryAssets(
      [[3, "https://127.0.0.1/private.png", { extension: "png" }]],
      "instagram",
    ).length,
    0,
  );
});
test("portrait caps use the short edge and Instagram picks compatible H264 without transcoding", () => {
  const info = {
    formats: [
      {
        format_id: "portrait",
        width: 1080,
        height: 1920,
        vcodec: "h264",
        acodec: "aac",
        protocol: "https",
        tbr: 3600,
      },
      {
        format_id: "vp9",
        width: 1088,
        height: 1936,
        vcodec: "vp9",
        acodec: "none",
        protocol: "https",
        tbr: 2100,
      },
      { format_id: "audio", vcodec: "none", acodec: "aac" },
    ],
  };
  assert.equal(chooseFormats(info, "1080", "instagram").format, "portrait");
  assert.equal(chooseFormats(info, "best", "instagram").format, "portrait");
  assert.throws(() => chooseFormats(info, "720", "instagram"), /quality limit/);
  assert.equal(chooseFormats(info, "best", "youtube").format, "bv*+ba/b/bv*");
  const stale = {
    ...info,
    requested_downloads: [{ format_id: "old" }],
    requested_formats: [{ format_id: "old" }],
    format_id: "old",
  };
  assert.equal(
    "requested_downloads" in chooseFormats(stale, "best", "instagram").entry,
    false,
  );
  assert.equal(
    "format_id" in chooseFormats(stale, "best", "instagram").entry,
    false,
  );
});
test("structured page data selects the requested carousel and TikTok photos, not another post", () => {
  const html = `<script type="application/json">${JSON.stringify({
    posts: [
      {
        code: "OTHER",
        display_url: "https://scontent.cdninstagram.com/wrong.jpg",
      },
      {
        code: "MIXED",
        carousel_media: [
          {
            image_versions2: {
              candidates: [
                { url: photo, width: 1080, height: 1350 },
                {
                  url: "https://scontent.cdninstagram.com/small.jpg",
                  width: 100,
                  height: 100,
                },
              ],
            },
          },
          {
            video_versions: [
              {
                url: "https://scontent.cdninstagram.com/v.mp4",
                width: 1080,
                height: 1920,
              },
            ],
            image_versions2: {
              candidates: [
                { url: "https://scontent.cdninstagram.com/poster.jpg" },
              ],
            },
          },
        ],
      },
    ],
  })}</script>`;
  const result = collectPostMedia({
    url: "https://www.instagram.com/p/MIXED/",
    platform: "instagram",
    html,
  });
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((item) => item.type),
    ["photo", "video"],
  );
  const tiktok = `<script>${JSON.stringify({ item: { id: "123", imagePost: { images: [{ imageURL: { urlList: ["https://p16.tiktokcdn.com/a.jpeg"], width: 1200, height: 1600 } }, { imageURL: { urlList: ["https://p16.tiktokcdn.com/b.jpeg"] } }] } } })}</script>`;
  assert.equal(
    collectPostMedia({
      url: "https://www.tiktok.com/@test/photo/123",
      platform: "tiktok",
      html: tiktok,
    }).items.length,
    2,
  );
  assert.equal(
    normalizePost("https://www.threads.net/@test/post/ABC123").platform,
    "threads",
  );
  assert.equal(
    normalizePost("https://id.pinterest.com/pin/123456789/").platform,
    "pinterest",
  );
  assert.equal(normalizePost("https://pin.it/ABC123").platform, "pinterest");
  const threadsHtml = `<script>${JSON.stringify({ post: { code: "THR", image_versions2: { candidates: [{ url: photo, width: 1080, height: 1350 }] } } })}</script>`;
  assert.equal(
    collectPostMedia({
      url: "https://www.threads.com/@demo/post/THR",
      platform: "threads",
      html: threadsHtml,
    }).items.length,
    1,
  );
  assert.equal(
    normalizePost("https://www.reddit.com/r/pics/s/ABC123/").platform,
    "reddit",
  );
});
test("photo download preserves bytes and rejects HTML and off-platform redirects", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "media-photo-scan-"));
  try {
    const filename = await savePhoto(
      { url: photo },
      "instagram",
      folder,
      1,
      async () => new Response(png),
    );
    assert.deepEqual(await readFile(filename), png);
    await assert.rejects(
      savePhoto(
        { url: photo },
        "instagram",
        folder,
        2,
        async () => new Response("<html>Login</html>"),
      ),
      /did not return an image/,
    );
    await assert.rejects(
      savePhoto(
        { url: photo },
        "instagram",
        folder,
        3,
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/secret" },
          }),
      ),
      /outside/,
    );
    assert.equal(
      trustedMediaUrl("https://cdninstagram.com.evil.test/a.jpg", "instagram"),
      false,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("mixed scan, selection, real photo bytes and scan failure history", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "media-scan-manager-"));
  const jobs = new Map(),
    active = new Set();
  const info = {
    id: "video",
    title: "Video fixture",
    formats: [
      {
        format_id: "source",
        url: "https://scontent.cdninstagram.com/v.mp4",
        width: 1080,
        height: 1920,
        vcodec: "h264",
        acodec: "aac",
        protocol: "https",
      },
    ],
  };
  let fail = false;
  const manager = createScanManager({
    jobs,
    active,
    executable: "video",
    galleryExecutable: "gallery",
    ffmpegDirectory: folder,
    resolveOutputDirectory: async () => folder,
    fetcher: async () => new Response(png),
    execute: async (command, args) => {
      if (args.includes("--dump-single-json"))
        return {
          stdout: fail ? "{}" : JSON.stringify(info),
          stderr: fail ? "ERROR: Login required" : "",
        };
      if (args.includes("--dump-json"))
        return {
          stdout: JSON.stringify(
            fail
              ? [[-1, { message: "Photo access requires login" }]]
              : [[3, photo, { extension: "png" }]],
          ),
          stderr: "",
        };
      if (args.includes("--load-info-json")) {
        assert.equal(args.includes("-af"), false);
        const output = args[args.indexOf("-P") + 1];
        await mkdir(output, { recursive: true });
        const file = path.join(output, "video.mp4");
        await writeFile(file, "video");
        return { stdout: `ME_FILE ${JSON.stringify(file)}\n`, stderr: "" };
      }
      return { stdout: "{}", stderr: "" };
    },
  });
  try {
    const scan = manager.start({ url: "https://www.instagram.com/p/MIXED/" });
    await until(() => scan.state !== "scanning");
    assert.equal(scan.state, "ready");
    assert.equal(scan.assets.length, 2);
    assert.throws(
      () =>
        manager.download({
          scanId: scan.id,
          assetIds: ["unknown"],
          quality: "best",
        }),
      /does not belong/,
    );
    const download = manager.download({
      scanId: scan.id,
      assetIds: scan.assets.map((a) => a.id),
      quality: "1080",
    });
    await until(() =>
      ["complete", "partial", "failed"].includes(download.state),
    );
    assert.equal(download.state, "complete");
    assert.equal(download.files.length, 2);
    fail = true;
    const failed = manager.start({ url: "https://www.instagram.com/p/FAIL/" });
    await until(() => failed.state === "failed");
    assert.match(failed.error, /login/i);
    assert.ok(jobs.has(failed.id));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("Threads scans structured public post media and Pinterest rejects board short links", async () => {
  const jobs = new Map(),
    active = new Set();
  const html = `<script>${JSON.stringify({ post: { code: "THR", carousel_media: [{ image_versions2: { candidates: [{ url: photo, width: 1080, height: 1350 }] } }, { video_versions: [{ url: "https://scontent.cdninstagram.com/clip.mp4", width: 1080, height: 1920 }] }] } })}</script>`;
  const manager = createScanManager({
    jobs,
    active,
    executable: "video",
    galleryExecutable: "gallery",
    ffmpegDirectory: "C:\\Tools",
    resolveOutputDirectory: async () => tmpdir(),
    fetcher: async (url) =>
      String(url).includes("pin.it")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://www.pinterest.com/user/board/" },
          })
        : new Response(html),
    execute: async () => ({
      stdout:
        '{"streams":[{"codec_type":"video","codec_name":"h264","width":1080,"height":1920},{"codec_type":"audio","codec_name":"aac"}]}',
      stderr: "",
    }),
  });
  const threads = manager.start({
    url: "https://www.threads.com/@demo/post/THR",
  });
  await until(() => threads.state !== "scanning");
  assert.equal(threads.state, "ready");
  assert.deepEqual(
    threads.assets.map((a) => a.type),
    ["photo", "video"],
  );
  const board = manager.start({ url: "https://pin.it/BOARD123" });
  await until(() => board.state === "failed");
  assert.match(board.error, /boards are not scanned/);
});
