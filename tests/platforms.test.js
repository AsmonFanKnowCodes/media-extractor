import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePost, QUALITIES } from "../extension/platforms.js";
import { photoArgs, listPhotos } from "../helper/photos.mjs";
import { downloadArgs } from "../helper/server.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("recognizes only individual posts across six platforms", () => {
  const urls = {
    youtube: "https://youtu.be/BaW_jenozKc",
    instagram: "https://www.instagram.com/p/AbC123_/?igsh=tracking",
    x: "https://twitter.com/test/status/123456789/photo/1",
    reddit: "https://www.reddit.com/r/pics/comments/abc123/a_title/",
    tiktok: "https://www.tiktok.com/@test/photo/123456789",
    facebook: "https://www.facebook.com/photo/?fbid=123456789",
  };
  for (const [platform, url] of Object.entries(urls))
    assert.equal(normalizePost(url)?.platform, platform, url);
  for (const url of [
    "https://instagram.com/user",
    "https://x.com/home",
    "https://reddit.com/r/pics",
    "https://www.tiktok.com/@user",
    "https://facebook.com/user",
    "https://instagram.com.evil.test/p/ABC",
    "https://user:pass@x.com/u/status/123",
    "http://127.0.0.1/private",
    "file:///secret",
    "https://x.com/u/status/123?next=http://localhost",
  ]) {
    if (url.includes("?next="))
      assert.equal(normalizePost(url).url, "https://x.com/u/status/123");
    else assert.equal(normalizePost(url), null, url);
  }
  assert.equal(
    normalizePost("https://vm.tiktok.com/ZMY123/").platform,
    "tiktok",
  );
  assert.equal(normalizePost("https://fb.watch/ABC123/").platform, "facebook");
  assert.deepEqual(QUALITIES, ["720", "1080", "1440", "2160", "best"]);
});
test("photo command ignores user config and cannot import credentials or arbitrary options", () => {
  const args = photoArgs("https://instagram.com/p/ABC123/", "C:\\Photos");
  assert.ok(args.includes("--config-ignore"));
  assert.ok(args.includes("--no-input"));
  assert.equal(args[args.indexOf("--directory") + 1], "C:\\Photos");
  assert.ok(args.includes("--filter"));
  assert.equal(args.at(-2), "--");
  assert.throws(() =>
    photoArgs("https://youtube.com/watch?v=BaW_jenozKc", "C:\\Photos"),
  );
});
test("photo results include nonempty media only", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "media-photo-list-"));
  try {
    await writeFile(path.join(dir, "1.jpg"), "image");
    await writeFile(path.join(dir, "2.webp"), "image");
    await writeFile(path.join(dir, "empty.png"), "");
    await writeFile(path.join(dir, "metadata.json"), "{}");
    assert.equal((await listPhotos(dir)).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Brave cookies are only requested after explicit opt-in, and never for YouTube", () => {
  const url = "https://www.instagram.com/p/ABC123/";
  assert.equal(
    photoArgs(url, "C:\\Photos").includes("--cookies-from-browser"),
    false,
  );
  assert.ok(
    photoArgs(url, "C:\\Photos", true).includes("--cookies-from-browser"),
  );
  assert.equal(
    downloadArgs(url, "2160", "C:\\Videos", "id", "C:\\Tools").includes(
      "--cookies-from-browser",
    ),
    false,
  );
  assert.ok(
    downloadArgs(url, "2160", "C:\\Videos", "id", "C:\\Tools", true).includes(
      "--cookies-from-browser",
    ),
  );
  assert.equal(
    downloadArgs(
      "https://youtu.be/BaW_jenozKc",
      "best",
      "C:\\Videos",
      "id",
      "C:\\Tools",
      true,
    ).includes("--cookies-from-browser"),
    false,
  );
});
