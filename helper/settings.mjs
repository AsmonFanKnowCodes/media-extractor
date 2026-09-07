import {
  readFile,
  writeFile,
  rename,
  stat,
  open,
  unlink,
  realpath,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export function createSettings(configPath) {
  const load = async () => JSON.parse(await readFile(configPath, "utf8"));
  let pending = Promise.resolve();
  function setFolder(value) {
    const operation = pending
      .catch(() => {})
      .then(async () => {
        if (
          typeof value !== "string" ||
          !path.isAbsolute(value) ||
          /[\x00-\x1f]/.test(value) ||
          /^\\\\[.?]\\/.test(value)
        )
          throw new Error("Choose a full folder path, for example D:\\Videos.");
        const folder = await realpath(path.resolve(value));
        if (!(await stat(folder)).isDirectory())
          throw new Error("Choose a folder, not a file.");
        const probe = path.join(
          folder,
          `.youtube-downloader-check-${randomUUID()}`,
        );
        const handle = await open(probe, "wx");
        await handle.close();
        await unlink(probe);
        const config = await load();
        config.outputDirectory = folder;
        const temporary = `${configPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(config, null, 2), "utf8");
          await rename(temporary, configPath);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
        return { outputDirectory: folder };
      });
    pending = operation;
    return operation;
  }
  return { load, setFolder };
}
