export const MEDIA_HOSTS = {
  youtube: ["googlevideo.com", "ytimg.com", "youtube.com"],
  instagram: ["cdninstagram.com", "fbcdn.net"],
  threads: ["cdninstagram.com", "fbcdn.net"],
  x: ["twimg.com"],
  reddit: ["redd.it", "redditmedia.com", "redditstatic.com"],
  tiktok: [
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokcdn-eu.com",
    "tiktokv.com",
    "tiktok.com",
    "byteoversea.com",
    "ibytedtos.com",
    "muscdn.com",
  ],
  facebook: ["fbcdn.net"],
  pinterest: ["pinimg.com"],
};
export function trustedMediaUrl(raw, platform) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (MEDIA_HOSTS[platform] || []).some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    );
  } catch {
    return false;
  }
}
export function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes.toString("ascii", 0, 6).startsWith("GIF8")) return "gif";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    /avif|avis/.test(bytes.toString("ascii", 8, 32))
  )
    return "avif";
  if (bytes.toString("ascii", 0, 2) === "BM") return "bmp";
  return null;
}
export function mediaKey(url) {
  try {
    const value = new URL(url);
    return value.origin + value.pathname;
  } catch {
    return url;
  }
}
