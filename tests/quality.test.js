import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { downloadArgs } from "../helper/server.mjs";

const executable = path.resolve("helper/bin/yt-dlp.exe");
test(
  "real yt-dlp selector respects 720/1080 caps and chooses higher-resolution WebM over lower MP4",
  { skip: !existsSync(executable) },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "youtube-quality-test-"),
    );
    try {
      const file = path.join(directory, "video.json");
      const formats = [
        {
          format_id: "v720",
          height: 720,
          width: 1280,
          ext: "mp4",
          vcodec: "avc1",
          acodec: "none",
        },
        {
          format_id: "v1080",
          height: 1080,
          width: 1920,
          ext: "mp4",
          vcodec: "avc1",
          acodec: "none",
        },
        {
          format_id: "v1440",
          height: 1440,
          width: 2560,
          ext: "mp4",
          vcodec: "avc1",
          acodec: "none",
        },
        {
          format_id: "v2160",
          height: 2160,
          width: 3840,
          ext: "webm",
          vcodec: "vp9",
          acodec: "none",
        },
        {
          format_id: "a",
          ext: "m4a",
          vcodec: "none",
          acodec: "mp4a",
          abr: 128,
        },
      ].map((format) => ({
        ...format,
        url: `https://example.invalid/${format.format_id}`,
        protocol: "https",
      }));
      await writeFile(
        file,
        JSON.stringify({
          id: "fixture",
          title: "Quality fixture",
          extractor: "test",
          webpage_url: "https://example.invalid/watch",
          formats,
        }),
      );
      for (const [quality, expected] of [
        ["720", "v720+a"],
        ["1080", "v1080+a"],
        ["1440", "v1440+a"],
        ["2160", "v2160+a"],
        ["best", "v2160+a"],
      ]) {
        const args = downloadArgs(
          "https://www.youtube.com/watch?v=BaW_jenozKc",
          quality,
          directory,
          "fixture",
          directory,
        );
        const result = spawnSync(
          executable,
          [
            "--ignore-config",
            "--no-plugin-dirs",
            "--load-info-json",
            file,
            "--simulate",
            "--print",
            "%(format_id)s",
            "-f",
            args[args.indexOf("-f") + 1],
            "-S",
            args[args.indexOf("-S") + 1],
          ],
          { encoding: "utf8", windowsHide: true, timeout: 15000 },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), expected);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
