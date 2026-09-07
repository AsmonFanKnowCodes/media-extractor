import { readFile, access, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHelper } from "./server.mjs";
import { createDecoder, encodeMessage } from "./native-protocol.mjs";
import { createSettings } from "./settings.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const directory = path.dirname(fileURLToPath(import.meta.url));
const settings = createSettings(path.join(directory, "config.json"));
const config = await settings.load();
const runFile = promisify(execFile);
let choosingFolder = false;
const manifest = JSON.parse(
  await readFile(path.join(directory, "..", "native-host.json"), "utf8"),
);
if (!manifest.allowed_origins.includes(process.argv[2]))
  throw new Error("Extension origin is not registered.");
await access(config.executable);
await access(path.join(config.ffmpegDirectory, "ffmpeg.exe"));
await mkdir(config.outputDirectory, { recursive: true });
// Reuse the tested download engine privately within this native host process.
// This random port/key is never exposed to the extension or a setup screen.
const token = randomBytes(32).toString("hex");
const server = createHelper({
  ...config,
  token,
  resolveOutputDirectory: async () => (await settings.load()).outputDirectory,
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const base = `http://127.0.0.1:${server.address().port}/v1/`;
function send(value) {
  process.stdout.write(encodeMessage(value));
}
const decode = createDecoder(async (message) => {
  const id = message.id;
  try {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new Error("Invalid request ID.");
    if (message.method === "set-folder") {
      const result = await settings.setFolder(message.params?.outputDirectory);
      send({ id, ok: true, ...result });
      return;
    }
    if (message.method === "choose-folder") {
      if (choosingFolder) throw new Error("A folder window is already open.");
      choosingFolder = true;
      try {
        const current = await settings.load();
        const { stdout } = await runFile(
          path.join(directory, "..", "folder-picker.exe"),
          [current.outputDirectory],
          { windowsHide: true, timeout: 300000, maxBuffer: 16384 },
        );
        const folder = stdout.replace(/^\uFEFF/, "").trim();
        const result = folder
          ? await settings.setFolder(folder)
          : { cancelled: true, outputDirectory: current.outputDirectory };
        send({ id, ok: true, ...result });
        return;
      } finally {
        choosingFolder = false;
      }
    }
    const route = { info: "info", jobs: "jobs", download: "jobs" }[
      message.method
    ];
    if (!route) throw new Error("Unknown downloader command.");
    const body =
      message.method === "download"
        ? { url: message.params?.url, quality: message.params?.quality }
        : null;
    const response = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Download request failed.");
    send({ id, ok: true, ...result });
  } catch (error) {
    send({ id, ok: false, error: error.message });
  }
});
process.stdin.on("data", (chunk) => {
  try {
    decode(chunk);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
process.stdin.on("end", () => {
  server.close();
  process.exit(0);
});
process.stdout.on("error", () => process.exit(0));
