import { trustedMediaUrl, mediaKey } from "./media-policy.mjs";
export function extractorError(stderr = "", records = []) {
  const errors = records
    .filter((row) => Array.isArray(row) && row[0] === -1)
    .map((row) => row[1]?.message || row[1]?.error)
    .filter(Boolean);
  const lines = stderr
    .split(/\r?\n/)
    .filter((line) => /ERROR:|\[error\]/i.test(line));
  return [...errors, ...lines].join(" ").slice(0, 1600);
}
export function galleryAssets(records, platform) {
  const items = [];
  for (const row of records) {
    if (
      !Array.isArray(row) ||
      row[0] !== 3 ||
      !trustedMediaUrl(row[1], platform)
    )
      continue;
    const metadata = row[2] || {};
    const extension = String(
      metadata.extension || new URL(row[1]).pathname.split(".").pop(),
    ).toLowerCase();
    const type = /^(jpg|jpeg|png|webp|avif|gif|bmp)$/.test(extension)
      ? "photo"
      : /^(mp4|webm|mov|m4v)$/.test(extension)
        ? "video"
        : null;
    if (type)
      items.push({
        type,
        url: row[1],
        width: Number(metadata.width || metadata.image_width) || 0,
        height: Number(metadata.height || metadata.image_height) || 0,
        title: String(
          metadata.description || metadata.title || metadata.filename || "",
        ).slice(0, 160),
        source: "post extractor",
      });
  }
  return items;
}
export function videoEntries(info) {
  if (!info || typeof info !== "object") return [];
  if (Array.isArray(info.entries)) return info.entries.flatMap(videoEntries);
  if (info.is_live) return [];
  return Array.isArray(info.formats) &&
    info.formats.some((f) => f.vcodec !== "none")
    ? [info]
    : [];
}
export function mergeCandidates(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.type + ":" + mediaKey(item.url);
    const old = map.get(key);
    if (
      !old ||
      (item.width || 0) * (item.height || 0) >
        (old.width || 0) * (old.height || 0)
    )
      map.set(key, item);
  }
  return [...map.values()];
}
export function chooseFormats(entry, quality, platform) {
  const cap = quality === "best" ? Infinity : Number(quality);
  const formats = (entry.formats || []).filter((format) => {
    if (format.vcodec === "images" || format.protocol === "mhtml") return false;
    if (format.vcodec === "none") return true;
    const short = Math.min(
      Number(format.width) || Infinity,
      Number(format.height) || Infinity,
    );
    return short <= cap;
  });
  if (!formats.some((f) => f.vcodec !== "none"))
    throw new Error(
      "No video format fits this quality limit. Choose Best available.",
    );
  // Instagram's progressive AVC source avoids problematic VP9 DASH playback.
  const progressive = formats.filter(
    (f) =>
      /^(avc|h264)/i.test(f.vcodec || "") &&
      f.acodec &&
      f.acodec !== "none" &&
      f.protocol === "https",
  );
  const chosen =
    platform === "instagram" && progressive.length
      ? progressive.sort(
          (a, b) =>
            b.width * b.height - a.width * a.height ||
            (b.tbr || 0) - (a.tbr || 0),
        )[0]
      : null;
  const clean = { ...entry, formats };
  // dump-single-json includes the probe's selected streams; do not let those
  // stale selections override the user's later quality/source choice.
  for (const key of [
    "requested_downloads",
    "requested_formats",
    "format_id",
    "format",
    "format_note",
    "url",
    "ext",
    "protocol",
    "vcodec",
    "acodec",
    "resolution",
    "width",
    "height",
    "tbr",
    "abr",
    "vbr",
  ])
    delete clean[key];
  return {
    entry: clean,
    format: chosen ? chosen.format_id : "bv*+ba/b/bv*",
    compatible: !!chosen,
  };
}
