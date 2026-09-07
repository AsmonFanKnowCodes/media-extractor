import { normalizePost } from "../extension/platforms.js";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export function photoArgs(raw, folder, useBrowserSession = false) {
  const post = normalizePost(raw);
  if (!post || post.platform === "youtube")
    throw new Error(
      "Photos require an Instagram, X, Reddit, TikTok or Facebook post.",
    );
  return [
    "--config-ignore",
    "--no-input",
    "--no-colors",
    "--retries",
    "2",
    "--http-timeout",
    "20",
    "--directory",
    folder,
    "--restrict-filenames",
    "windows",
    "--filter",
    "extension.lower() in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp')",
    ...(useBrowserSession ? ["--cookies-from-browser", "brave"] : []),
    "--",
    post.url,
  ];
}
export async function listPhotos(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !/\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(entry.name)
    )
      continue;
    const filename = path.join(folder, entry.name);
    if ((await stat(filename)).size > 0) files.push(filename);
  }
  return files.sort();
}
