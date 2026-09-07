import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieArgs } from "../helper/browser-session.mjs";
import { downloadArgs } from "../helper/server.mjs";
import { photoArgs } from "../helper/photos.mjs";

test("login stays off unless enabled, with an explicit browser allowlist", () => {
  assert.deepEqual(cookieArgs(false, "anything"), []);
  for (const browser of ["brave", "chrome", "edge"])
    assert.deepEqual(cookieArgs(true, browser), [
      "--cookies-from-browser",
      browser,
    ]);
  for (const browser of [
    "",
    "firefox",
    "brave:../../profile",
    "chrome --exec calc",
  ])
    assert.throws(() => cookieArgs(true, browser));
});
test("photo and video commands use the selected browser without reading cookies during tests", () => {
  const url = "https://instagram.com/p/ABC123/";
  for (const browser of ["brave", "chrome", "edge"]) {
    for (const args of [
      downloadArgs(url, "1080", "C:\\Videos", "id", "C:\\Tools", true, browser),
      photoArgs(url, "C:\\Photos", true, browser),
    ]) {
      assert.equal(args[args.indexOf("--cookies-from-browser") + 1], browser);
    }
  }
});
