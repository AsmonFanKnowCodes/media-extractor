import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePost, PLATFORMS, QUALITIES } from "../extension/platforms.js";
import { photoArgs, listPhotos } from "./photos.mjs";
import { cookieArgs, LOGIN_BROWSERS } from "./browser-session.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const runFile = promisify(execFile);
export function downloadArgs(
  url,
  quality,
  outputDirectory,
  jobId,
  ffmpegDirectory,
  useBrowserSession = false,
  loginBrowser = "brave",
) {
  const post = normalizePost(url);
  const normalized = post?.url;
  if (!normalized) throw new Error("Enter a supported video or post URL.");
  if (!QUALITIES.includes(quality))
    throw new Error("Choose a supported quality.");
  const cap = quality === "best" ? "" : `[height<=${quality}]`;
  return [
    "--ignore-config",
    "--no-plugin-dirs",
    "--no-playlist",
    "--no-overwrites",
    "--no-colors",
    "--newline",
    "--progress",
    "--no-simulate",
    "--js-runtimes",
    `node:${process.execPath}`,
    "--ffmpeg-location",
    ffmpegDirectory,
    "--socket-timeout",
    "30",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--match-filters",
    "!is_live",
    "-f",
    `bv*${cap}+ba/b${cap}/bv*${cap}`,
    "-S",
    "res,ext:mp4:m4a",
    "--merge-output-format",
    "mp4/mkv",
    "--windows-filenames",
    "--trim-filenames",
    "170",
    "-P",
    outputDirectory,
    "-o",
    `%(title).110B [%(id)s] ${jobId.slice(0, 8)}.%(ext)s`,
    "--progress-template",
    "download:ME_PROGRESS %(progress._percent_str)s",
    "--print",
    "after_move:ME_FILE %(filepath)j",
    ...cookieArgs(
      useBrowserSession && post.platform !== "youtube",
      loginBrowser,
    ),
    "--",
    normalized,
  ];
}

export function createHelper({
  token,
  executable,
  galleryExecutable,
  ffmpegDirectory,
  outputDirectory,
  resolveOutputDirectory = async () => outputDirectory,
  spawnProcess = spawn,
}) {
  const jobs = new Map();
  const active = new Set();
  function publicJob(job) {
    return {
      id: job.id,
      url: job.url,
      quality: job.quality,
      state: job.state,
      progress: job.progress,
      error: job.error,
      filename: job.filename,
      createdAt: job.createdAt,
      outputDirectory: job.outputDirectory,
      width: job.width,
      height: job.height,
      platform: job.platform,
      mediaType: job.mediaType,
      files: job.files,
      directory: job.directory,
    };
  }
  const server = createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    // Bind only to loopback; reject DNS rebinding and requests from normal web pages.
    if (req.headers.host !== `127.0.0.1:${server.address().port}`)
      return send(403, { error: "Invalid local host." });
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
      return send(403, { error: "Only the extension may connect." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.writeHead(204);
      res.end();
      return;
    }
    const received = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      return send(401, {
        error:
          "Pairing key did not match. Copy the key from the helper window.",
      });
    try {
      if (req.method === "GET" && req.url === "/v1/info")
        return send(200, {
          name: "Media Extractor Helper",
          version: "6.1.0",
          loginBrowsers: LOGIN_BROWSERS,
          platforms: Object.keys(PLATFORMS),
          photosAvailable: !!galleryExecutable,
          outputDirectory: await resolveOutputDirectory(),
        });
      if (req.method === "GET" && req.url === "/v1/jobs")
        return send(200, { jobs: [...jobs.values()].reverse().map(publicJob) });
      if (req.method !== "POST" || req.url !== "/v1/jobs")
        return send(404, { error: "Not found." });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096)
          return send(413, { error: "Request too large." });
      }
      const data = JSON.parse(body);
      const post = normalizePost(data.url);
      const url = post?.url;
      if (!post)
        return send(400, {
          error:
            "Enter a post link from YouTube, Instagram, X, Reddit, TikTok or Facebook.",
        });
      const mediaType = data.mediaType || "video";
      const useBrowserSession =
        data.useBrowserSession === true && post.platform !== "youtube";
      if (!["video", "photos"].includes(mediaType))
        return send(400, { error: "Choose Video or Photos." });
      if (mediaType === "photos" && post.platform === "youtube")
        return send(400, { error: "YouTube photo posts are not supported." });
      if (mediaType === "photos" && !galleryExecutable)
        return send(503, {
          error:
            "Photo support needs the updated helper. Run MediaExtractor-Setup.exe once.",
        });
      if (active.size >= 2)
        return send(409, {
          error: "Two downloads are already running. Wait for one to finish.",
        });
      const duplicate = [...jobs.values()].find(
        (j) => active.has(j.id) && j.url === url && j.mediaType === mediaType,
      );
      if (duplicate) return send(200, { job: publicJob(duplicate) });
      const id = randomUUID();
      const baseDirectory = await resolveOutputDirectory();
      const jobDirectory =
        mediaType === "photos"
          ? path.join(
              baseDirectory,
              `${PLATFORMS[post.platform]} photos ${id.slice(0, 8)}`,
            )
          : baseDirectory;
      await mkdir(jobDirectory, { recursive: true });
      const args =
        mediaType === "photos"
          ? photoArgs(url, jobDirectory, useBrowserSession, data.loginBrowser)
          : downloadArgs(
              url,
              data.quality,
              jobDirectory,
              id,
              ffmpegDirectory,
              useBrowserSession,
              data.loginBrowser,
            );
      const job = {
        id,
        url,
        platform: post.platform,
        mediaType,
        files: [],
        directory: jobDirectory,
        quality: data.quality,
        state: "preparing",
        progress:
          mediaType === "photos"
            ? "Finding photos in this post…"
            : "Finding video and audio…",
        createdAt: new Date().toISOString(),
        outputDirectory: baseDirectory,
      };
      while (jobs.size >= 50) {
        const oldest = [...jobs.keys()].find((key) => !active.has(key));
        if (!oldest) break;
        jobs.delete(oldest);
      }
      if (active.size >= 2)
        return send(409, {
          error: "Two downloads are already running. Wait for one to finish.",
        });
      jobs.set(id, job);
      active.add(id);
      const child = spawnProcess(
        mediaType === "photos" ? galleryExecutable : executable,
        args,
        {
          windowsHide: true,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let pending = "",
        errorTail = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (mediaType === "photos") {
          job.state = "downloading";
          job.progress = "Downloading photos…";
        }
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop().slice(-16384);
        for (const line of lines) {
          if (line.startsWith("ME_PROGRESS ")) {
            job.state = "downloading";
            job.progress = `Downloading track: ${line.slice(12).trim()}`;
          }
          if (line.startsWith("[Merger]")) {
            job.state = "processing";
            job.progress = "Combining video and audio…";
          }
          if (line.startsWith("ME_FILE ")) {
            try {
              const filename = JSON.parse(line.slice(8));
              if (
                typeof filename === "string" &&
                path.dirname(path.resolve(filename)) ===
                  path.resolve(jobDirectory)
              ) {
                job.filename ||= filename;
                if (!job.files.includes(filename)) job.files.push(filename);
              }
            } catch {
              /* Ignore malformed external output. */
            }
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        errorTail = (errorTail + chunk).slice(-8000);
      });
      child.on("error", (error) => {
        job.state = "failed";
        job.error = `Cannot start downloader: ${error.message}. Run MediaExtractor-Setup.exe again.`;
        active.delete(id);
      });
      child.on("close", async (code) => {
        active.delete(id);
        if (job.state === "failed") return;
        if (mediaType === "photos") {
          job.files = await listPhotos(jobDirectory).catch(() => []);
          job.filename = job.files[0];
        } else {
          const verified = [];
          for (const file of job.files) {
            try {
              await access(file);
              verified.push(file);
            } catch {}
          }
          job.files = verified;
          job.filename = verified[0];
        }
        if (code !== 0 && job.files.length) {
          job.state = "partial";
          job.error = `Saved ${job.files.length} file(s), but some media failed. ${errorTail.slice(-900)}`;
          return;
        }
        if (code === 0 && job.filename) {
          try {
            await access(job.filename);
            try {
              if (mediaType === "photos" || job.files.length > 1)
                throw new Error("Multi-file metadata is shown per file.");
              const { stdout } = await runFile(
                path.join(ffmpegDirectory, "ffprobe.exe"),
                [
                  "-v",
                  "error",
                  "-select_streams",
                  "v:0",
                  "-show_entries",
                  "stream=width,height",
                  "-of",
                  "json",
                  job.filename,
                ],
                { windowsHide: true, timeout: 10000, maxBuffer: 65536 },
              );
              const video = JSON.parse(stdout).streams?.[0];
              if (
                Number.isInteger(video?.width) &&
                Number.isInteger(video?.height)
              ) {
                job.width = video.width;
                job.height = video.height;
              }
            } catch {
              /* A saved file stays saved even when metadata inspection is unavailable. */
            }
            job.state = "complete";
            job.progress =
              mediaType === "photos"
                ? `Saved ${job.files.length} photo(s).`
                : `Saved ${job.files.length} video(s).`;
            return;
          } catch {
            /* Missing output must not be reported as saved. */
          }
        }
        job.state = "failed";
        const errors = errorTail
          .split(/\r?\n/)
          .filter((line) => line.startsWith("ERROR:"));
        job.error =
          errors.slice(-2).join(" ").slice(0, 1400) ||
          `No ${mediaType === "photos" ? "photos" : "videos"} were saved. This post may have no matching media, need login, or be unavailable.`;
      });
      send(202, { job: publicJob(job) });
    } catch (error) {
      send(400, { error: error.message });
    }
  });
  server.requestTimeout = 10000;
  return server;
}

async function main() {
  const config = JSON.parse(
    await readFile(path.join(directory, ".local", "config.json"), "utf8").catch(
      () => {
        throw new Error("Run MediaExtractor-Setup.exe first.");
      },
    ),
  );
  const keyPath = path.join(directory, ".local", "pairing-key.txt");
  let token;
  try {
    token = (await readFile(keyPath, "utf8")).trim();
  } catch {
    token = randomBytes(32).toString("hex");
    await writeFile(keyPath, token + "\n", { mode: 0o600 });
  }
  const outputDirectory =
    config.outputDirectory ||
    path.join(homedir(), "Downloads", "Media Extractor", "YouTube");
  await mkdir(outputDirectory, { recursive: true });
  await access(config.executable);
  await access(path.join(config.ffmpegDirectory, "ffmpeg.exe"));
  const server = createHelper({ ...config, token, outputDirectory });
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "The helper is already running, or port 43127 is in use."
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(43127, "127.0.0.1", () => {
    console.log(
      `YouTube Video Downloader Helper\n\nPairing key (paste once in the extension):\n${token}\n\nSaving to: ${outputDirectory}\nKeep this window open while downloading.\n`,
    );
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
