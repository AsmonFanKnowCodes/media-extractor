import { test } from "node:test";
import assert from "node:assert/strict";
import {
  downloadable,
  filenameFor,
  mediaType,
  mergeMedia,
} from "../extension/core.js";

test("classifies signed and mixed case media URLs without dropping query strings", () => {
  assert.equal(mediaType("https://site.test/clip.MP4?token=123"), "video");
  assert.equal(mediaType("https://site.test/master.m3u8"), "stream");
  assert.equal(mediaType("https://site.test/photo.avif"), "image");
  assert.equal(mediaType("bad URL"), null);
});
test("allows direct files but rejects temporary, protected, and unsafe URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///secret",
    "blob:https://site.test/1",
  ])
    assert.equal(downloadable({ url, type: "video" }), false);
  assert.equal(
    downloadable({ url: "https://site.test/stream.m3u8", type: "stream" }),
    false,
  );
  assert.equal(
    downloadable({ url: "data:image/png;base64,YQ==", type: "image" }),
    true,
  );
});
test("download names cannot escape their directory and work on Windows", () => {
  assert.equal(
    filenameFor({ url: "https://site.test/CON.jpg", type: "image" }),
    "Media Extractor/_CON.jpg",
  );
  assert.equal(
    filenameFor({ url: "https://site.test/a%2Fb%3Fc.png", type: "image" }),
    "Media Extractor/a_b_c.png",
  );
  assert.equal(
    filenameFor({ url: "data:image/svg+xml;base64,YQ==", type: "image" }),
    "Media Extractor/image-1.svg",
  );
  assert.equal(
    filenameFor({
      url: "https://site.test/%2e%2e%2fsecret.jpg",
      type: "image",
    }),
    "Media Extractor/_secret.jpg",
  );
});
test("deduplicates exact URLs and preserves the best dimensions and signed variants", () => {
  const items = mergeMedia([
    { items: [{ url: "https://site.test/a.jpg", width: 0 }] },
    {
      items: [
        { url: "https://site.test/a.jpg", width: 400 },
        { url: "https://site.test/a.jpg?v=2", width: 200 },
      ],
    },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].width, 400);
});
