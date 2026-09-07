import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function extensionId(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  const normalized = path.win32
    .resolve(directory)
    .replace(/^[a-z]:/, (letter) => letter.toUpperCase());
  const bytes = manifest.key
    ? Buffer.from(manifest.key, "base64")
    : Buffer.from(normalized, "utf16le");
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (char) =>
      String.fromCharCode(97 + parseInt(char, 16)),
    );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(await extensionId(process.argv[2]));
