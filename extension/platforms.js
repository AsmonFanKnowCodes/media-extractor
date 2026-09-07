import { normalizeYouTubeUrl } from "./youtube-url.js";

export const PLATFORMS = {
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  reddit: "Reddit",
  tiktok: "TikTok",
  facebook: "Facebook",
  pinterest: "Pinterest",
  threads: "Threads",
};
export const QUALITIES = ["720", "1080", "1440", "2160", "best"];
export const PLATFORM_ASSETS = {
  youtube: "assets/youtube-logo.png",
  instagram: "assets/instagram.webp",
  x: "assets/x.ico",
  reddit: "assets/reddit.png",
  tiktok: "assets/tiktok.png",
  facebook: "assets/facebook.ico",
  pinterest: "assets/pinterest.png",
  threads: "assets/threads.ico",
};
export function normalizePost(raw) {
  const youtube = normalizeYouTubeUrl(raw);
  if (youtube) return { platform: "youtube", url: youtube };
  try {
    const input = new URL(raw);
    if (
      !["http:", "https:"].includes(input.protocol) ||
      input.username ||
      input.password ||
      input.port
    )
      return null;
    const host = input.hostname.toLowerCase();
    const pathname = input.pathname.replace(/\/+$/, "");
    let match;
    if (host === "pin.it" && /^\/[a-z0-9]+$/i.test(pathname))
      return { platform: "pinterest", url: `https://pin.it${pathname}` };
    if (
      [
        "threads.net",
        "www.threads.net",
        "threads.com",
        "www.threads.com",
      ].includes(host) &&
      /^\/@[\w.]+\/post\/[\w-]+$/.test(pathname)
    )
      return { platform: "threads", url: `https://www.threads.com${pathname}` };
    if (
      /^(?:www\.|[a-z]{2}\.)?pinterest\.(?:com|co\.uk|com\.au|de|fr|ca|jp|es|it|pt|ch|at|se|dk|nl|co\.kr|co\.in|com\.mx|com\.br|id)$/.test(
        host,
      ) &&
      (match = pathname.match(/^\/pin\/(\d+)(?:\/sent)?$/))
    )
      return {
        platform: "pinterest",
        url: `https://www.pinterest.com/pin/${match[1]}/`,
      };
    if (
      ["instagram.com", "www.instagram.com"].includes(host) &&
      (match = pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)$/))
    )
      return {
        platform: "instagram",
        url: `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/`,
      };
    if (
      [
        "x.com",
        "www.x.com",
        "twitter.com",
        "www.twitter.com",
        "mobile.twitter.com",
      ].includes(host) &&
      (match = pathname.match(
        /^\/(?:([\w]+)\/status|i\/web\/status)\/(\d+)(?:\/(?:photo|video)\/\d+)?$/,
      ))
    )
      return {
        platform: "x",
        url: `https://x.com/${match[1] || "i"}/status/${match[2]}`,
      };
    if (
      [
        "reddit.com",
        "www.reddit.com",
        "old.reddit.com",
        "new.reddit.com",
        "m.reddit.com",
      ].includes(host)
    ) {
      if (/^\/r\/[^/]+\/s\/[a-z0-9]+$/i.test(pathname))
        return {
          platform: "reddit",
          url: `https://www.reddit.com${pathname}/`,
        };
      match =
        pathname.match(/^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/.*)?$/i) ||
        pathname.match(/^\/gallery\/([a-z0-9]+)$/i);
      if (match)
        return {
          platform: "reddit",
          url: `https://www.reddit.com/comments/${match[1]}/`,
        };
    }
    if (host === "redd.it" && /^\/[a-z0-9]+$/i.test(pathname))
      return {
        platform: "reddit",
        url: `https://www.reddit.com/comments/${pathname.slice(1)}/`,
      };
    if (
      ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host) &&
      /^\/@[\w.-]+\/(video|photo)\/\d+$/.test(pathname)
    )
      return { platform: "tiktok", url: `https://www.tiktok.com${pathname}` };
    if (
      ["tiktok.com", "www.tiktok.com"].includes(host) &&
      /^\/t\/[\w-]+$/.test(pathname)
    )
      return { platform: "tiktok", url: `https://www.tiktok.com${pathname}/` };
    if (
      ["vm.tiktok.com", "vt.tiktok.com"].includes(host) &&
      /^\/[a-z0-9]+$/i.test(pathname)
    )
      return { platform: "tiktok", url: `https://${host}${pathname}/` };
    if (host === "fb.watch" && /^\/[\w-]+$/.test(pathname))
      return { platform: "facebook", url: `https://fb.watch${pathname}/` };
    if (
      [
        "facebook.com",
        "www.facebook.com",
        "m.facebook.com",
        "web.facebook.com",
      ].includes(host)
    ) {
      if (
        ["/watch", "/watch/", "/video.php"].includes(pathname) &&
        /^\d+$/.test(input.searchParams.get("v") || "")
      )
        return {
          platform: "facebook",
          url: `https://www.facebook.com/watch/?v=${input.searchParams.get("v")}`,
        };
      if (
        ["/photo", "/photo.php"].includes(pathname) &&
        /^\d+$/.test(input.searchParams.get("fbid") || "")
      )
        return {
          platform: "facebook",
          url: `https://www.facebook.com/photo.php?fbid=${input.searchParams.get("fbid")}`,
        };
      if (
        /^\/(?:reel\/\d+|share\/[vrp]\/[\w-]+|[\w.-]+\/(?:videos|posts)\/[\w-]+|groups\/[\w.-]+\/posts\/[\w-]+)$/.test(
          pathname,
        )
      )
        return {
          platform: "facebook",
          url: `https://www.facebook.com${pathname}/`,
        };
    }
  } catch {}
  return null;
}
