export function mediaType(url) {
  let path;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (/\.(mp4|webm|mov|m4v|ogv|avi)$/.test(path)) return "video";
  if (/\.(m3u8|mpd)$/.test(path)) return "stream";
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/.test(path))
    return "image";
  return null;
}

export function downloadable(item) {
  return (
    ["image", "video"].includes(item.type) &&
    /^(https?:|data:(image|video)\/)/i.test(item.url)
  );
}

export function filenameFor(item, index = 0) {
  const url = new URL(item.url);
  let name = url.protocol === "data:" ? "" : url.pathname.split("/").pop();
  try {
    name = decodeURIComponent(name);
  } catch {
    /* Retain encoded malformed names. */
  }
  name = (name || `${item.type}-${index + 1}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+|[. ]+$/g, "")
    .slice(0, 140);
  if (!name) name = `media-${index + 1}`;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = `_${name}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
    const mime = item.url.match(/^data:(?:image|video)\/([\w+.-]+)/i)?.[1];
    const extension = { jpeg: "jpg", "svg+xml": "svg" }[mime] || mime;
    if (extension && /^[a-z0-9]{2,5}$/i.test(extension))
      name += `.${extension}`;
    // For extensionless server URLs Chrome determines the actual type from the response.
  }
  return `Media Extractor/${name}`;
}

export function mergeMedia(frames) {
  const map = new Map();
  for (const frame of frames)
    for (const item of frame.items || []) {
      const existing = map.get(item.url);
      if (!existing || (item.width || 0) > (existing.width || 0))
        map.set(item.url, item);
    }
  return [...map.values()];
}
