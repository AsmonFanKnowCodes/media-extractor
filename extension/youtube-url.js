export function normalizeYouTubeUrl(raw) {
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    let id;
    if (host === "youtu.be" && parts.length === 1) id = parts[0];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (
        ["shorts", "live", "embed"].includes(parts[0]) &&
        parts.length === 2
      )
        id = parts[1];
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id || "")
      ? `https://www.youtube.com/watch?v=${id}`
      : null;
  } catch {
    return null;
  }
}
