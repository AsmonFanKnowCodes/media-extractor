import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createSettings } from "../helper/settings.mjs";

test("save folder persists, preserves tool configuration, and rejects invalid destinations", async () => {
  const directory = await realpath(
    await mkdtemp(path.join(tmpdir(), "youtube-folder-test-")),
  );
  try {
    const configPath = path.join(directory, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        executable: "downloader.exe",
        outputDirectory: directory,
      }),
    );
    const settings = createSettings(configPath);
    const folder = path.join(directory, "my videos 日本語");
    await mkdir(folder);
    assert.equal((await settings.setFolder(folder)).outputDirectory, folder);
    assert.equal(
      (await createSettings(configPath).load()).outputDirectory,
      folder,
    );
    assert.equal((await settings.load()).executable, "downloader.exe");
    await assert.rejects(settings.setFolder("relative/path"));
    await assert.rejects(
      settings.setFolder(path.join(directory, "does-not-exist")),
    );
    await assert.rejects(settings.setFolder(configPath));
    assert.equal(
      JSON.parse(await readFile(configPath, "utf8")).outputDirectory,
      folder,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
