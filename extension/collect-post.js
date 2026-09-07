// Self-contained so Chrome can serialize it into the already-open matching post.
export function collectPostMedia(input) {
  const { url, platform } = input;
  const target = new URL(url).pathname.split("/").filter(Boolean).pop();
  const found = new Map();
  let visited = 0,
    truncated = false;
  const add = (raw, type, width = 0, height = 0, source = "page data") => {
    if (typeof raw !== "string") return;
    try {
      const parsed = new URL(raw.replaceAll("&amp;", "&"), url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.href.length > 4096
      )
        return;
      const item = {
        url: parsed.href,
        type,
        width: Number(width) || 0,
        height: Number(height) || 0,
        source,
      };
      if (!found.has(item.url) && found.size < 100) found.set(item.url, item);
      else if (found.size >= 100) truncated = true;
    } catch {}
  };
  const best = (values) =>
    Array.isArray(values)
      ? [...values].sort(
          (a, b) =>
            (Number(b.width) || 0) * (Number(b.height) || 0) -
            (Number(a.width) || 0) * (Number(a.height) || 0),
        )[0]
      : null;
  function media(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 25 || ++visited > 40000) {
      if (visited > 40000) truncated = true;
      return;
    }
    if (Array.isArray(node)) {
      for (const value of node) media(value, depth + 1);
      return;
    }
    const video = best(node.video_versions);
    if (video) add(video.url, "video", video.width, video.height);
    if (node.video_url)
      add(
        node.video_url,
        "video",
        node.dimensions?.width,
        node.dimensions?.height,
      );
    if (!video && !node.is_video && !node.video_url) {
      const candidate =
        best(node.image_versions2?.candidates) || best(node.display_resources);
      if (candidate)
        add(
          candidate.url || candidate.src,
          "photo",
          candidate.width || candidate.config_width,
          candidate.height || candidate.config_height,
        );
      else if (node.display_url)
        add(
          node.display_url,
          "photo",
          node.dimensions?.width,
          node.dimensions?.height,
        );
    }
    if (Array.isArray(node.imagePost?.images))
      for (const img of node.imagePost.images) {
        const source = img.imageURL || img.displayImage || img;
        add(
          source.urlList?.[0] || source.url_list?.[0],
          "photo",
          source.width || img.width,
          source.height || img.height,
        );
      }
    if (node.media_metadata)
      for (const asset of Object.values(node.media_metadata)) {
        if (asset?.s)
          add(asset.s.u || asset.s.gif, "photo", asset.s.x, asset.s.y);
      }
    if (platform === "reddit" && !node.is_video && node.preview?.images)
      for (const image of node.preview.images)
        add(
          image.source?.url,
          "photo",
          image.source?.width,
          image.source?.height,
        );
    for (const [key, value] of Object.entries(node))
      if (
        ![
          "image_versions2",
          "display_resources",
          "video_versions",
          "imagePost",
          "media_metadata",
          "preview",
        ].includes(key)
      )
        media(value, depth + 1);
  }
  function find(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 35 || ++visited > 40000) {
      if (visited > 40000) truncated = true;
      return;
    }
    if (
      !Array.isArray(node) &&
      [node.shortcode, node.code, node.id, node.pk].some(
        (value) =>
          (platform === "reddit"
            ? String(value || "").replace(/^t3_/, "")
            : String(value || "")) === target,
      )
    ) {
      media(node);
      return;
    }
    for (const value of Object.values(node)) find(value, depth + 1);
  }
  const browser =
    typeof input.html !== "string" && typeof document !== "undefined";
  if (browser && !location.pathname.includes(target))
    return { items: [], truncated: false };
  const html = browser ? "" : input.html || "";
  const scripts = browser
    ? [
        ...document.querySelectorAll(
          'script[type="application/json"],script[id="__NEXT_DATA__"],script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]',
        ),
      ].map((node) => node.textContent)
    : [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
        (match) => match[1],
      );
  for (const script of scripts) {
    if (script.length > 12000000) {
      truncated = true;
      continue;
    }
    try {
      find(JSON.parse(script));
    } catch {}
  }
  if (browser) {
    let scope;
    if (platform === "instagram" || platform === "threads") {
      const articles = [...document.querySelectorAll("article")];
      scope =
        articles.find((article) =>
          [...article.querySelectorAll("a[href]")].some((a) =>
            a.href.includes(target),
          ),
        ) || (articles.length === 1 ? articles[0] : null);
    } else if (platform === "reddit")
      scope = [...document.querySelectorAll("shreddit-post")].find((node) =>
        [node.getAttribute("id"), node.getAttribute("post-id")].some((value) =>
          (value || "").includes(target),
        ),
      );
    else if (platform === "pinterest")
      scope = document.querySelector('[data-test-id="pin-closeup-image"]');
    else if (platform === "tiktok")
      scope = document.querySelector('[data-e2e="photo-image"]')?.parentElement;
    if (scope)
      for (const img of [
        ...(scope.matches("img") ? [scope] : []),
        ...scope.querySelectorAll("img"),
      ]) {
        if (img.naturalWidth < 300 || img.naturalHeight < 250) continue;
        const source =
          [...(img.srcset || "").matchAll(/(?:^|,\s*)(\S+)\s+(\d+)w/g)].sort(
            (a, b) => Number(b[2]) - Number(a[2]),
          )[0]?.[1] ||
          img.currentSrc ||
          img.src;
        add(source, "photo", img.naturalWidth, img.naturalHeight, "open post");
      }
    // Post metadata is a conservative fallback, not an enumeration of a feed.
    const video = document.querySelector(
      'meta[property="og:video:secure_url"],meta[property="og:video"]',
    )?.content;
    if (video) add(video, "video", 0, 0, "post metadata");
    const canonical =
      document.querySelector('meta[property="og:url"]')?.content ||
      location.href;
    if (!video && !found.size && canonical.includes(target))
      add(
        document.querySelector('meta[property="og:image"]')?.content,
        "photo",
        0,
        0,
        "post metadata",
      );
  } else {
    const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
    const get = (name) => {
      const tag = tags.find((tag) =>
        new RegExp(`(?:property|name)=["']${name}["']`, "i").test(tag),
      );
      return tag?.match(/content=["']([^"']+)["']/i)?.[1];
    };
    const video = get("og:video:secure_url") || get("og:video");
    if (video) add(video, "video");
    if (!video && !found.size && (get("og:url") || "").includes(target))
      add(get("og:image"), "photo");
  }
  return { items: [...found.values()], truncated };
}
