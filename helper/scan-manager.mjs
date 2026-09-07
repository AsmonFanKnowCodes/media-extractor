import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  unlink,
  open,
  rename,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizePost, PLATFORMS, QUALITIES } from "../extension/platforms.js";
import { collectPostMedia } from "../extension/collect-post.js";
import { cookieArgs } from "./browser-session.mjs";
import {
  extractorError,
  galleryAssets,
  videoEntries,
  mergeCandidates,
  chooseFormats,
} from "./scan-parser.mjs";
import { trustedMediaUrl, imageType, mediaKey } from "./media-policy.mjs";

const execute = promisify(execFile);
export async function savePhoto(
  asset,
  platform,
  directory,
  index,
  fetcher = fetch,
) {
  let url = asset.url,
    response;
  for (let redirects = 0; redirects < 6; redirects++) {
    if (!trustedMediaUrl(url, platform))
      throw new Error(
        "The image address is outside this platform’s media hosts.",
      );
    response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: { Referer: asset.postUrl || "", "User-Agent": "Mozilla/5.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location"), url).href;
      continue;
    }
    break;
  }
  if (!response?.ok || !response.body)
    throw new Error(
      `Image request failed (${response?.status || "no response"}). Rescan for a fresh link.`,
    );
  const partial = path.join(directory, `.photo-${randomUUID()}.part`);
  const handle = await open(partial, "wx");
  let size = 0,
    prefix = Buffer.alloc(0),
    extension;
  try {
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > 200 * 1024 * 1024)
        throw new Error("Image exceeds the 200 MB file limit.");
      if (prefix.length < 32) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, 32 - prefix.length)]);
        extension = imageType(prefix);
      }
      await handle.writeFile(chunk);
    }
    if (!extension)
      throw new Error(
        "The server did not return an image. Rescan or enable your browser login.",
      );
    await handle.close();
    const filename = path.join(
      directory,
      `Photo ${String(index).padStart(2, "0")}.${extension}`,
    );
    await rename(partial, filename);
    return filename;
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(partial).catch(() => {});
    throw error;
  }
}

export function createScanManager(options) {
  const {
    jobs,
    active,
    executable,
    galleryExecutable,
    ffmpegDirectory,
    resolveOutputDirectory,
  } = options;
  const run = options.execute || execute;
  const fetcher = options.fetcher || fetch;
  const cache = new Map();
  const serializeAsset = (asset) => ({
    id: asset.id,
    type: asset.type,
    title: asset.title,
    width: asset.width || 0,
    height: asset.height || 0,
    thumbnail: asset.thumbnail || "",
    source: asset.source || "post extractor",
  });
  const reserve = (job) => {
    if (active.size >= 2)
      throw new Error(
        "Two operations are already running. Wait for one to finish.",
      );
    while (jobs.size >= 50) {
      const id = [...jobs.keys()].find((id) => !active.has(id));
      if (!id) break;
      jobs.delete(id);
      cache.delete(id);
    }
    jobs.set(job.id, job);
    active.add(job.id);
  };
  async function tool(command, args) {
    try {
      return await run(command, args, {
        windowsHide: true,
        timeout: 90000,
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (error) {
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message || "Extractor failed.",
        failed: true,
      };
    }
  }
  async function probeFormat(format) {
    try {
      const result = await run(
        path.join(ffmpegDirectory, "ffprobe.exe"),
        [
          "-v",
          "error",
          "-rw_timeout",
          "12000000",
          "-show_entries",
          "stream=codec_name,codec_type,width,height,bit_rate:format=bit_rate",
          "-of",
          "json",
          format.url,
        ],
        { windowsHide: true, timeout: 18000, maxBuffer: 100000 },
      );
      const info = JSON.parse(result.stdout);
      const video = info.streams?.find((s) => s.codec_type === "video");
      const audio = info.streams?.find((s) => s.codec_type === "audio");
      return {
        ...format,
        width: video?.width || format.width,
        height: video?.height || format.height,
        vcodec: video?.codec_name || format.vcodec,
        acodec: audio?.codec_name || (video ? "none" : format.acodec),
        tbr: Number(info.format?.bit_rate) / 1000 || format.tbr,
        protocol: "https",
      };
    } catch {
      return format;
    }
  }
  async function scan(job, data, post) {
    if (new URL(post.url).hostname === "pin.it") {
      let target = post.url,
        resolved;
      for (let hop = 0; hop < 6; hop++) {
        const parsed = new URL(target);
        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          !(
            parsed.hostname === "pin.it" ||
            parsed.hostname === "pinterest.com" ||
            parsed.hostname.endsWith(".pinterest.com")
          )
        )
          throw new Error("Pinterest short link redirects outside Pinterest.");
        const response = await fetcher(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });
        const candidate = normalizePost(target);
        if (
          candidate?.platform === "pinterest" &&
          new URL(candidate.url).hostname !== "pin.it"
        ) {
          resolved = candidate;
          break;
        }
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) break;
        target = new URL(location, target).href;
      }
      if (!resolved)
        throw new Error(
          "Open this Pinterest link and copy the individual pin URL; boards are not scanned.",
        );
      post = resolved;
    }
    const warnings = [];
    let candidates = [],
      entries = [];
    const auth = cookieArgs(
      data.useBrowserSession === true && post.platform !== "youtube",
      data.loginBrowser,
    );
    const ytdlpArgs = [
      "--ignore-config",
      "--no-plugin-dirs",
      "--no-playlist",
      "--skip-download",
      "--dump-single-json",
      "--no-warnings",
      "--socket-timeout",
      "15",
      "--retries",
      "1",
      "--extractor-retries",
      "1",
      "--js-runtimes",
      `node:${process.execPath}`,
      ...auth,
      "--",
      post.url,
    ];
    const galleryArgs = [
      "--config-ignore",
      "--no-input",
      "--no-colors",
      "--dump-json",
      "--retries",
      "1",
      "--http-timeout",
      "15",
      ...auth,
      "--",
      post.url,
    ];
    const results = await Promise.all([
      post.platform === "threads"
        ? Promise.resolve(null)
        : tool(executable, ytdlpArgs),
      post.platform === "youtube" ||
      post.platform === "threads" ||
      !galleryExecutable
        ? Promise.resolve(null)
        : tool(galleryExecutable, galleryArgs),
    ]);
    if (results[0]) {
      try {
        entries = videoEntries(JSON.parse(results[0].stdout));
      } catch {}
      if (!entries.length) {
        const reason = extractorError(results[0].stderr);
        if (reason) warnings.push(`Video extraction: ${reason}`);
      }
    }
    if (results[1]) {
      try {
        const records = JSON.parse(results[1].stdout);
        candidates.push(...galleryAssets(records, post.platform));
        const reason = extractorError(results[1].stderr, records);
        if (reason) warnings.push(`Photo extraction: ${reason}`);
      } catch {
        const reason = extractorError(results[1].stderr);
        if (reason) warnings.push(reason);
      }
    }
    if (post.platform === "threads") {
      warnings.push(
        "Threads uses public page data or the matching open post. Load the post in your browser if items are missing.",
      );
      try {
        let target = post.url,
          response;
        for (let hop = 0; hop < 4; hop++) {
          const parsed = new URL(target);
          if (
            parsed.protocol !== "https:" ||
            ![
              "threads.com",
              "www.threads.com",
              "threads.net",
              "www.threads.net",
            ].includes(parsed.hostname)
          )
            throw new Error(
              "Threads redirected outside its post pages. Open the post in your browser.",
            );
          response = await fetcher(target, {
            redirect: "manual",
            signal: AbortSignal.timeout(20000),
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          target = new URL(response.headers.get("location"), target).href;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        if (html.length < 12000000)
          candidates.push(...collectPostMedia({ ...post, html }).items);
      } catch (error) {
        warnings.push(`Threads page: ${error.message}`);
      }
    }
    const pageItems = Array.isArray(data.pageMedia?.items)
      ? data.pageMedia.items.slice(0, 100)
      : [];
    const trustedPage = pageItems.filter(
      (item) =>
        ["photo", "video"].includes(item.type) &&
        trustedMediaUrl(item.url, post.platform),
    );
    if (trustedPage.length) {
      candidates.push(...trustedPage);
      if (!results[1] || !galleryAssetsSafe(results[1], post.platform).length)
        warnings.push(
          "Some media came from the open post. Hidden or unloaded slides may be missing.",
        );
    }
    if (data.pageMedia?.truncated)
      warnings.push(
        "The open post contains more data than could be scanned safely.",
      );
    let assets = [];
    for (const [index, entry] of entries.entries()) {
      if (post.platform === "instagram") {
        const urls = new Map();
        const unknown = (entry.formats || [])
          .filter(
            (f) =>
              f.protocol === "https" &&
              f.vcodec !== "none" &&
              (!f.width || !f.height) &&
              trustedMediaUrl(f.url, post.platform),
          )
          .slice(0, 3);
        for (const format of unknown) {
          const key = mediaKey(format.url);
          if (!urls.has(key)) urls.set(key, await probeFormat(format));
          const { width, height, vcodec, acodec, tbr, protocol } =
            urls.get(key);
          Object.assign(format, {
            width,
            height,
            vcodec,
            acodec,
            tbr,
            protocol,
          });
        }
      }
      const videoFormats = entry.formats.filter((f) => f.vcodec !== "none");
      const compatible =
        post.platform === "instagram"
          ? chooseFormats(entry, "best", post.platform)
          : null;
      const best = compatible?.compatible
        ? entry.formats.find((f) => f.format_id === compatible.format)
        : [...videoFormats].sort(
            (a, b) =>
              (b.width || 0) * (b.height || 0) -
              (a.width || 0) * (a.height || 0),
          )[0];
      assets.push({
        id: randomUUID(),
        type: "video",
        title: String(entry.title || `Video ${index + 1}`).slice(0, 180),
        width: best?.width,
        height: best?.height,
        thumbnail:
          (entry.thumbnails || [])
            .reverse()
            .find((t) => trustedMediaUrl(t.url, post.platform))?.url ||
          (trustedMediaUrl(entry.thumbnail, post.platform)
            ? entry.thumbnail
            : ""),
        entry,
        source: compatible?.compatible ? "Compatible H.264" : "video extractor",
      });
    }
    candidates = mergeCandidates(
      candidates.filter((item) => trustedMediaUrl(item.url, post.platform)),
    );
    const knownVideos = new Set(
      entries.flatMap((entry) =>
        (entry.formats || []).map((format) => mediaKey(format.url || "")),
      ),
    );
    for (const item of candidates) {
      if (item.type === "video" && knownVideos.has(mediaKey(item.url)))
        continue;
      const asset = {
        ...item,
        id: randomUUID(),
        title:
          item.title ||
          `${item.type === "photo" ? "Photo" : "Video"} ${assets.length + 1}`,
        postUrl: post.url,
      };
      if (asset.type === "photo") asset.thumbnail = asset.url;
      else {
        if (post.platform === "reddit" && /DASH_/i.test(asset.url)) continue;
        const format = await probeFormat({
          format_id: "direct",
          url: asset.url,
          protocol: "https",
          width: asset.width,
          height: asset.height,
        });
        asset.entry = {
          id: asset.id,
          title: asset.title,
          webpage_url: post.url,
          extractor: "generic",
          formats: [format],
        };
        asset.width = format.width;
        asset.height = format.height;
      }
      assets.push(asset);
    }
    if (assets.length > 100) {
      assets = assets.slice(0, 100);
      warnings.push("Showing the first 100 media items.");
    }
    if (!assets.length)
      throw new Error(
        warnings.join(" ") ||
          "No downloadable media was found. Open the post, load its slides, or enable your browser login and scan again.",
      );
    while (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(job.id, { assets, post, created: Date.now() });
    job.assets = assets.map(serializeAsset);
    job.warnings = [...new Set(warnings)].slice(0, 4);
    job.state = "ready";
    job.progress = `Found ${assets.filter((a) => a.type === "photo").length} photos and ${assets.filter((a) => a.type === "video").length} videos.`;
  }
  function galleryAssetsSafe(result, platform) {
    try {
      return galleryAssets(JSON.parse(result.stdout), platform);
    } catch {
      return [];
    }
  }
  function start(data) {
    const post = normalizePost(data.url);
    if (!post)
      throw new Error(
        "Enter an individual post link from a supported platform.",
      );
    const job = {
      id: randomUUID(),
      kind: "scan",
      url: post.url,
      platform: post.platform,
      state: "scanning",
      progress: "Inspecting this post for photos and videos…",
      createdAt: new Date().toISOString(),
      assets: [],
      warnings: [],
      files: [],
    };
    reserve(job);
    Promise.resolve()
      .then(() => scan(job, data, post))
      .catch((error) => {
        job.state = "failed";
        job.error = error.message.slice(0, 2500);
      })
      .finally(() => active.delete(job.id));
    return job;
  }
  async function saveVideo(asset, post, quality, directory, index, data) {
    const selected = chooseFormats(asset.entry, quality, post.platform);
    const filename = path.join(
      tmpdir(),
      `media-extractor-info-${randomUUID()}.json`,
    );
    await writeFile(filename, JSON.stringify(selected.entry), "utf8");
    try {
      const args = [
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-playlist",
        "--no-overwrites",
        "--no-colors",
        "--no-simulate",
        "--socket-timeout",
        "30",
        "--retries",
        "2",
        "--ffmpeg-location",
        ffmpegDirectory,
        "--js-runtimes",
        `node:${process.execPath}`,
        "--load-info-json",
        filename,
        "-f",
        selected.format,
        "-S",
        "res,abr,ext:mp4:m4a",
        "--merge-output-format",
        "mp4/mkv",
        "--windows-filenames",
        "--trim-filenames",
        "170",
        "-P",
        directory,
        "-o",
        `${String(index).padStart(2, "0")} %(title).100B [%(id)s].%(ext)s`,
        "--print",
        "after_move:ME_FILE %(filepath)j",
        ...cookieArgs(
          data.useBrowserSession === true && post.platform !== "youtube",
          data.loginBrowser,
        ),
      ];
      const result = await run(executable, args, {
        windowsHide: true,
        timeout: 3600000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const line = result.stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith("ME_FILE "));
      if (!line)
        throw new Error("The downloader did not report a saved video.");
      const output = JSON.parse(line.slice(8));
      if (path.dirname(path.resolve(output)) !== path.resolve(directory))
        throw new Error("Invalid download output path.");
      await access(output);
      return output;
    } finally {
      await unlink(filename).catch(() => {});
    }
  }
  function download(data) {
    const cached = cache.get(data.scanId);
    if (!cached || Date.now() - cached.created > 20 * 60 * 1000)
      throw new Error(
        "This scan expired. Scan the post again for fresh media links.",
      );
    if (!QUALITIES.includes(data.quality))
      throw new Error("Choose a supported video quality.");
    const ids = Array.isArray(data.assetIds) ? [...new Set(data.assetIds)] : [];
    if (!ids.length || ids.length > 100)
      throw new Error("Select at least one scanned item.");
    const assets = ids.map((id) =>
      cached.assets.find((asset) => asset.id === id),
    );
    if (assets.some((asset) => !asset))
      throw new Error("Selection does not belong to this scan.");
    const job = {
      id: randomUUID(),
      kind: "download",
      scanId: data.scanId,
      url: cached.post.url,
      platform: cached.post.platform,
      state: "preparing",
      progress: "Starting selected downloads…",
      quality: data.quality,
      createdAt: new Date().toISOString(),
      files: [],
      errors: [],
      mediaType: "mixed",
    };
    reserve(job);
    Promise.resolve()
      .then(async () => {
        job.outputDirectory = await resolveOutputDirectory();
        job.directory = path.join(
          job.outputDirectory,
          `${PLATFORMS[cached.post.platform]} ${job.id.slice(0, 8)}`,
        );
        await mkdir(job.directory, { recursive: true });
        for (const [index, asset] of assets.entries()) {
          job.state = "downloading";
          job.progress = `Saving ${index + 1} of ${assets.length}: ${asset.type}…`;
          try {
            const file =
              asset.type === "photo"
                ? await (options.savePhoto || savePhoto)(
                    asset,
                    cached.post.platform,
                    job.directory,
                    index + 1,
                    fetcher,
                  )
                : await saveVideo(
                    asset,
                    cached.post,
                    data.quality,
                    job.directory,
                    index + 1,
                    data,
                  );
            job.files.push(file);
            job.filename ||= file;
          } catch (error) {
            job.errors.push(
              `${asset.title}: ${(error.stderr || error.message).slice(-1200)}`,
            );
          }
        }
        job.state = job.errors.length
          ? job.files.length
            ? "partial"
            : "failed"
          : "complete";
        job.progress = `Saved ${job.files.length} of ${assets.length} items.`;
        if (job.errors.length) job.error = job.errors.join(" ").slice(0, 2500);
      })
      .catch((error) => {
        job.state = job.files.length ? "partial" : "failed";
        job.error = error.message;
      })
      .finally(() => active.delete(job.id));
    return job;
  }
  function result(id) {
    const job = jobs.get(id);
    if (!job || job.kind !== "scan")
      throw new Error("Scan not found. Scan this post again.");
    return {
      id: job.id,
      url: job.url,
      state: job.state,
      assets: job.assets || [],
      warnings: job.warnings || [],
      error: job.error,
      progress: job.progress,
    };
  }
  return { start, download, result };
}
