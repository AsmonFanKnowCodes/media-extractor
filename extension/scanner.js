// Self-contained: Chrome serializes this function into the source page.
export function scanPage() {
  const items = new Map();
  let inaccessibleFrames = 0;
  function classify(url) {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv|avi)$/.test(path)) return "video";
    if (/\.(m3u8|mpd)$/.test(path)) return "stream";
    if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/.test(path))
      return "image";
    return null;
  }
  function add(raw, type, node, source, base) {
    if (!raw || typeof raw !== "string") return;
    try {
      const url = new URL(raw.trim(), base).href;
      if (!/^(https?:|blob:|data:(image|video)\/)/i.test(url)) return;
      type = classify(url) || type;
      if (!type) return;
      const item = {
        url,
        type,
        source,
        width: node?.naturalWidth || node?.videoWidth || 0,
        height: node?.naturalHeight || node?.videoHeight || 0,
        alt: node?.alt || "",
      };
      const old = items.get(url);
      if (!old || item.width > old.width) items.set(url, item);
    } catch {
      /* Ignore invalid website URLs. */
    }
  }
  function visit(root, doc) {
    const base = doc.baseURI;
    for (const node of root.querySelectorAll("*")) {
      const tag = node.tagName.toLowerCase();
      if (tag === "img") {
        for (const attr of [
          "src",
          "data-src",
          "data-original",
          "data-lazy-src",
        ])
          add(node.getAttribute(attr), "image", node, "Image", base);
        add(node.currentSrc, "image", node, "Image", base);
      }
      if (
        tag === "img" ||
        (tag === "source" && node.parentElement?.tagName === "PICTURE")
      ) {
        for (const attr of ["srcset", "data-srcset"]) {
          const set = node.getAttribute(attr) || "";
          for (const match of set.matchAll(
            /(?:^|\s*,\s*)([^\s,]+)(?:\s+\d+(?:\.\d+)?[wx])?/g,
          )) {
            if (!match[1].startsWith("data:"))
              add(match[1], "image", node, "Responsive image", base);
          }
        }
      }
      if (tag === "video") {
        add(node.currentSrc || node.src, "video", node, "Video", base);
        add(node.poster, "image", null, "Video poster", base);
        for (const source of node.querySelectorAll("source"))
          add(source.src, "video", node, "Video source", base);
      }
      if (tag === "a") add(node.href, null, null, "Media link", base);
      if (tag === "meta") {
        const key =
          node.getAttribute("property") || node.getAttribute("name") || "";
        if (/^(og:image(?::url|:secure_url)?|twitter:image)$/.test(key))
          add(node.content, "image", null, "Page metadata", base);
        if (/^og:video(?::url|:secure_url)?$/.test(key))
          add(node.content, "video", null, "Page metadata", base);
      }
      const style = doc.defaultView.getComputedStyle(node);
      for (const match of style.backgroundImage.matchAll(
        /url\(["']?(.*?)["']?\)/g,
      ))
        add(match[1], "image", null, "Background", base);
      if (node.shadowRoot) visit(node.shadowRoot, doc);
      if (tag === "iframe") {
        try {
          if (node.contentDocument?.documentElement)
            visit(node.contentDocument, node.contentDocument);
          else inaccessibleFrames++;
        } catch {
          inaccessibleFrames++;
        }
      }
    }
  }
  visit(document, document);
  for (const resource of performance.getEntriesByType("resource"))
    add(resource.name, null, null, "Loaded resource", document.baseURI);
  return {
    items: [...items.values()],
    inaccessibleFrames,
    title: document.title,
    url: location.href,
  };
}
