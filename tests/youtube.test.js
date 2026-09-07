import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeYouTubeUrl } from "../extension/youtube-url.js";
import { createHelper, downloadArgs } from "../helper/server.mjs";

const id = "BaW_jenozKc";
test("normalizes YouTube watch, short, embed and live links and removes playlist/tracking parameters", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}&list=ignore`,
    `https://youtu.be/${id}?t=1`,
    `https://m.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
  ])
    assert.equal(
      normalizeYouTubeUrl(url),
      `https://www.youtube.com/watch?v=${id}`,
    );
});
test("rejects spoofed hosts, local URLs, credentials, playlists and invalid IDs", () => {
  for (const url of [
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://youtube.com@evil.test/watch?v=${id}`,
    `https://user:pass@youtube.com/watch?v=${id}`,
    `http://127.0.0.1/watch?v=${id}`,
    `https://youtube.com:123/watch?v=${id}`,
    "https://youtube.com/playlist?list=123",
    "file:///video",
    "--exec=calc",
    "https://youtube.com/watch?v=bad",
  ])
    assert.equal(normalizeYouTubeUrl(url), null);
});
test("downloader receives fixed arguments, quality cap, audio merging and canonical single URL", () => {
  const args = downloadArgs(
    `https://youtu.be/${id}?list=abc`,
    "1080",
    "C:\\Downloads",
    "12345678-test",
    "C:\\ffmpeg",
  );
  assert.ok(args.includes("--ignore-config"));
  assert.ok(args.includes("--no-plugin-dirs"));
  assert.ok(args.includes("--no-playlist"));
  assert.match(args[args.indexOf("-f") + 1], /height<=1080/);
  assert.match(args[args.indexOf("-f") + 1], /\+ba/);
  assert.deepEqual(args.slice(-2), [
    "--",
    `https://www.youtube.com/watch?v=${id}`,
  ]);
  assert.throws(() =>
    downloadArgs(`https://youtu.be/${id}`, "--exec=calc", "/tmp", "id", "/tmp"),
  );
});
test("helper requires pairing, rejects page origins and tracks actual output files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "media-extractor-unit-"));
  const token = "a".repeat(64);
  const children = [];
  const server = createHelper({
    token,
    executable: "test-downloader",
    ffmpegDirectory: directory,
    outputDirectory: directory,
    spawnProcess: (exe, args, options) => {
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      children.push(child);
      return child;
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  try {
    assert.equal((await fetch(`${base}/v1/info`)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/v1/info`, {
          headers: { ...headers, Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${base}/v1/info`, { headers })).status, 200);
    assert.equal(
      (
        await fetch(`${base}/v1/jobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: "http://127.0.0.1/admin",
            quality: "1080",
          }),
        })
      ).status,
      400,
    );
    const response = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: `https://youtu.be/${id}`, quality: "1080" }),
    });
    assert.equal(response.status, 202);
    children[0].stdout.write("ME_PROGRESS  50.0%\n");
    let jobs = (await (await fetch(`${base}/v1/jobs`, { headers })).json())
      .jobs;
    assert.equal(jobs[0].state, "downloading");
    const duplicate = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: `https://youtu.be/${id}`, quality: "1080" }),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(children.length, 1);
    const filename = path.join(directory, "video.mp4");
    await writeFile(filename, "video-audio-fixture");
    children[0].stdout.write(`ME_FILE ${JSON.stringify(filename)}\n`);
    children[0].emit("close", 0);
    for (let n = 0; n < 30; n++) {
      jobs = (await (await fetch(`${base}/v1/jobs`, { headers })).json()).jobs;
      if (jobs[0].state === "complete") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(jobs[0].state, "complete");
    assert.equal(jobs[0].filename, filename);
    await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: `https://youtu.be/${id}`, quality: "720" }),
    });
    children[1].stderr.write("ERROR: This video is unavailable.\n");
    children[1].emit("close", 1);
    jobs = (await (await fetch(`${base}/v1/jobs`, { headers })).json()).jobs;
    assert.equal(jobs[0].state, "failed");
    assert.match(jobs[0].error, /unavailable/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
