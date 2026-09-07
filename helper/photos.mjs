import { normalizePost } from "../extension/platforms.js";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { cookieArgs } from "./browser-session.mjs";

export function photoArgs(
  raw,
  folder,
  useBrowserSession = false,
  loginBrowser = "brave",
) {
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
    ...cookieArgs(useBrowserSession, loginBrowser),
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
